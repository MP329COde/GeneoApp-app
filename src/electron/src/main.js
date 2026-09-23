import { app, BrowserWindow, shell } from 'electron';
import { isSafeExternalUrl } from './external-links.js';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createApp } from '../../server/src/app.js';
import { TreeWorkspace, createLiveServices } from '../../server/src/trees/tree-workspace.js';
import {
  StorageService,
  configuredDataDir,
  readStorageConfig,
} from '../../server/src/storage/storage-config.js';
import { registerIpcHandlers } from './ipc/register-ipc-handlers.js';

const host = '127.0.0.1';
const port = 0;
const preloadPath = fileURLToPath(new URL('./preload.js', import.meta.url));

let server;
let workspace;
let unregisterIpcHandlers;

async function createWindow() {
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
  unregisterIpcHandlers = registerIpcHandlers(createLiveServices(workspace), workspace, storage);
  // Sauvegarde automatique au lancement (rétention limitée, jamais bloquante).
  workspace.services.backups.createAutomatic('lancement').catch((error) => {
    console.error('Sauvegarde de lancement impossible :', error.message);
  });

  server = createServer(createApp({ workspace, storage })).listen(port, host);
  await new Promise((resolve) => server.once('listening', resolve));

  const window = new BrowserWindow({
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
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

  await window.loadFile(new URL('../../client/dist/index.html', import.meta.url).pathname);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  unregisterIpcHandlers?.();
  server?.close();
  workspace?.close();
  if (process.platform !== 'darwin') app.quit();
});
