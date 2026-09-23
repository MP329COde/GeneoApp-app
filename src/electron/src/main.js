import { app, BrowserWindow } from 'electron';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createApp } from '../../server/src/app.js';
import { TreeWorkspace, createLiveServices } from '../../server/src/trees/tree-workspace.js';
import { registerIpcHandlers } from './ipc/register-ipc-handlers.js';

const host = '127.0.0.1';
const port = 0;
const preloadPath = fileURLToPath(new URL('./preload.js', import.meta.url));

let server;
let workspace;
let unregisterIpcHandlers;

async function createWindow() {
  const userData = app.getPath('userData');
  workspace = new TreeWorkspace({
    dataDir: userData,
    defaultDatabaseFile: path.join(userData, process.env.GENEOAPP_DATABASE ?? 'geneoapp.sqlite'),
  });
  // Services résolus à chaque appel : un changement d'arbre est suivi par
  // l'IPC et par l'API HTTP sans ré-enregistrer les handlers.
  unregisterIpcHandlers = registerIpcHandlers(createLiveServices(workspace), workspace);

  server = createServer(createApp({ workspace })).listen(port, host);
  await new Promise((resolve) => server.once('listening', resolve));

  const window = new BrowserWindow({
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
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
