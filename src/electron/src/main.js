import { app, BrowserWindow, ipcMain, session, shell } from 'electron';
import { isSafeExternalUrl } from './external-links.js';
import { createLocalHttpGuard } from './security/local-http-guard.js';
import { buildContentSecurityPolicy } from './security/content-security-policy.js';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import express from 'express';
import { createApp } from '../../server/src/app.js';
import { TreeWorkspace, createLiveServices } from '../../server/src/trees/tree-workspace.js';
import { startIndexScheduler } from '../../server/src/indexing/index.service.js';
import { stopOcr } from '../../server/src/indexing/content-extract.js';
import {
  StorageService,
  configuredDataDir,
  readStorageConfig,
} from '../../server/src/storage/storage-config.js';
import { registerIpcHandlers } from './ipc/register-ipc-handlers.js';

const host = '127.0.0.1';
const port = 0;
const preloadPath = fileURLToPath(new URL('./preload.js', import.meta.url));
// Jeton local partagé process principal / renderer (voir local-http-guard.js) :
// protège le serveur HTTP embarqué contre tout autre processus local et
// contre le DNS-rebinding (en complément de dnsRebindingProtection côté app).
const httpToken = randomBytes(32).toString('hex');
let mapMode = 'offline';

let server;
let workspace;
let unregisterIpcHandlers;

async function createWindow() {
  ipcMain.handle('geneoapp:settings:setMapMode', (_event, mode) => {
    mapMode = mode === 'online' ? 'online' : 'offline';
    return { ok: true };
  });

  // Applique la CSP dynamique à toutes les réponses chargées dans la fenêtre
  // (fichiers locaux inclus) : seule source d'application fiable en
  // Electron, contrairement à une balise <meta> statique qui ne peut pas
  // être mise à jour de façon fiable après le chargement de la page.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [buildContentSecurityPolicy(mapMode)],
      },
    });
  });

  const userData = app.getPath('userData');
  // Dossier de travail choisi (clé USB…) s'il est branché, sinon le dossier de l'app.
  const portableDir = configuredDataDir(userData);
  workspace = new TreeWorkspace({
    dataDir: portableDir ?? userData,
    portable: Boolean(portableDir),
    mirrorDir: () => readStorageConfig(userData).mirrorDir,
    defaultDatabaseFile: path.join(userData, process.env.GENEOAPP_DATABASE ?? 'geneoapp.sqlite'),
    // Sauvegardes durables dans le dossier de l'application (jamais le
    // dossier temporaire du système, qui peut être vidé).
    backupDir: process.env.GENEOAPP_BACKUP_DIR ?? path.join(userData, 'backups'),
  });
  // Services résolus à chaque appel : un changement d'arbre est suivi par
  // l'IPC et par l'API HTTP sans ré-enregistrer les handlers.
  const storage = new StorageService({ configDir: userData, workspace });
  // Indexation nocturne planifiée tant que l'application est ouverte (ADR 0011).
  startIndexScheduler(() => workspace.services.indexing);
  unregisterIpcHandlers = registerIpcHandlers(createLiveServices(workspace), workspace, storage);
  // Sauvegarde automatique au lancement (rétention limitée, jamais bloquante).
  workspace.services.backups.createAutomatic('lancement').catch((error) => {
    console.error('Sauvegarde de lancement impossible :', error.message);
  });

  // Le serveur HTTP embarqué n'est lié qu'à 127.0.0.1, mais reste accessible
  // à tout autre processus local (et à un site distant via DNS-rebinding
  // sans dnsRebindingProtection, déjà appliquée par createApp). On exige en
  // plus un jeton connu uniquement du process principal et du renderer.
  const guarded = express();
  guarded.use(createLocalHttpGuard(httpToken));
  guarded.use(createApp({ workspace, storage }));
  server = createServer(guarded).listen(port, host);
  await new Promise((resolve) => server.once('listening', resolve));

  const window = new BrowserWindow({
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Seul canal de transmission du jeton local au renderer : jamais par
      // le réseau ni par une variable globale accessible à une page distante.
      additionalArguments: [`--geneoapp-http-token=${httpToken}`],
    },
  });

  // Aucune fenêtre ni navigation vers l'extérieur dans l'application : les
  // liens https (sites de recherche généalogique) s'ouvrent dans le navigateur
  // du système, tout le reste est refusé.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault();
      if (isSafeExternalUrl(url)) shell.openExternal(url);
    }
  });

  // fileURLToPath (et non l'accès brut à .pathname d'une URL file://) : seul
  // moyen correct de retrouver un chemin de fichier système, notamment sous
  // Windows (lettre de lecteur) et avec des caractères non-ASCII encodés.
  await window.loadFile(fileURLToPath(new URL('../../client/dist/index.html', import.meta.url)));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  unregisterIpcHandlers?.();
  server?.close();
  workspace?.close();
  if (process.platform !== 'darwin') app.quit();
});

// Libère le worker OCR (tesseract.js) avant de quitter, pour ne jamais
// laisser le process bloqué en arrière-plan.
app.on('before-quit', (event) => {
  event.preventDefault();
  stopOcr()
    .catch((error) => console.error('Arrêt du worker OCR impossible :', error.message))
    .finally(() => app.exit(0));
});
