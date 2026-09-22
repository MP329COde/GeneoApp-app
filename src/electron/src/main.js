import { app, BrowserWindow } from 'electron';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createApp } from '../../server/src/app.js';
import { createDatabase } from '../../server/src/db.js';
import { createServices } from '../../server/src/services/index.js';
import { registerIpcHandlers } from './ipc/register-ipc-handlers.js';

const host = '127.0.0.1';
const port = 0;
const preloadPath = fileURLToPath(new URL('./preload.js', import.meta.url));

let server;
let database;
let unregisterIpcHandlers;

async function createWindow() {
  database = createDatabase(
    path.join(app.getPath('userData'), process.env.GENEOAPP_DATABASE ?? 'geneoapp.sqlite'),
  );
  const services = createServices(database);
  unregisterIpcHandlers = registerIpcHandlers(services);

  server = createServer(createApp({ database })).listen(port, host);
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
  database?.close();
  if (process.platform !== 'darwin') app.quit();
});
