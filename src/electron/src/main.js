import { app, BrowserWindow, ipcMain, protocol, shell } from 'electron';
import { isSafeExternalUrl } from './external-links.js';
import { createLocalHttpGuard } from './security/local-http-guard.js';
import { buildContentSecurityPolicy } from './security/content-security-policy.js';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
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
const preloadPath = fileURLToPath(new URL('./preload.cjs', import.meta.url));
const distDir = fileURLToPath(new URL('../../client/dist/', import.meta.url));

// Renderer servi via un schéma personnalisé (geneoapp://app/…) plutôt que
// file:// : constaté en lançant réellement l'app (voir docs/adr/0013), la
// CSP recalculée dynamiquement (session.defaultSession.webRequest.
// onHeadersReceived) ne s'applique PAS de façon fiable à une navigation
// file://, alors que Network.responseReceived rapportait bien l'en-tête
// attendu — seule la balise <meta> statique (toujours identique, quel que
// soit le mode carte) était réellement appliquée. Le mode « hors ligne »
// n'empêchait donc en réalité aucune requête de tuile. `protocol.handle`
// donne un contrôle direct et fiable sur les en-têtes de chaque réponse.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'geneoapp',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: false },
  },
]);

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

function registerAppProtocol() {
  protocol.handle('geneoapp', async (request) => {
    const { pathname } = new URL(request.url);
    const relative = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
    const filePath = path.join(distDir, relative);
    // Empêche toute évasion du dossier dist (ex. `geneoapp://app/../../…`) :
    // le fichier résolu doit toujours rester à l'intérieur de `distDir`.
    if (!filePath.startsWith(distDir)) {
      return new Response('Forbidden', { status: 403 });
    }
    try {
      const body = await readFile(filePath);
      const contentType = MIME_TYPES[path.extname(filePath)] ?? 'application/octet-stream';
      const headers = { 'Content-Type': contentType };
      if (relative === '/index.html') {
        // Sans cet en-tête, un simple window.reload() peut être servi
        // depuis le cache HTTP du renderer plutôt que de repasser par ce
        // handler : la CSP resterait figée sur celle du tout premier
        // chargement, quel que soit le mode carte choisi ensuite (constaté
        // en conditions réelles, voir docs/adr/0013).
        headers['Cache-Control'] = 'no-store';
        headers['Content-Security-Policy'] = buildContentSecurityPolicy(mapMode);
      }
      return new Response(body, { headers });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}
// Jeton local partagé process principal / renderer (voir local-http-guard.js) :
// protège le serveur HTTP embarqué contre tout autre processus local et
// contre le DNS-rebinding (en complément de dnsRebindingProtection côté app).
const httpToken = randomBytes(32).toString('hex');
let mapMode = 'offline';

let server;
let workspace;
let unregisterIpcHandlers;
let mainWindow;

async function createWindow() {
  // La CSP (Content-Security-Policy) d'une page est fixée à la navigation
  // qui l'a chargée : changer `mapMode` ne modifie PAS la politique déjà
  // appliquée à la page en cours, seulement celle d'une future navigation.
  // Constaté en lançant réellement l'app (voir docs/adr/0013) : sans
  // rechargement explicite, le mode carte « en ligne » choisi dans les
  // Réglages n'autorisait jamais les tuiles OpenStreetMap dans la session
  // en cours (uniquement après un relancement complet de l'app, qui
  // réinitialise de toute façon `mapMode` à 'offline'). Un rechargement de
  // la fenêtre après le changement est donc nécessaire pour que le nouveau
  // mode prenne réellement effet.
  ipcMain.handle('geneoapp:settings:setMapMode', (_event, mode) => {
    const next = mode === 'online' ? 'online' : 'offline';
    const changed = next !== mapMode;
    mapMode = next;
    if (changed) mainWindow?.webContents.reload();
    return { ok: true };
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
  mainWindow = window;

  // Aucune fenêtre ni navigation vers l'extérieur dans l'application : les
  // liens https (sites de recherche généalogique) s'ouvrent dans le navigateur
  // du système, tout le reste est refusé.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('geneoapp://')) {
      event.preventDefault();
      if (isSafeExternalUrl(url)) shell.openExternal(url);
    }
  });

  registerAppProtocol();
  await window.loadURL('geneoapp://app/index.html');
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
