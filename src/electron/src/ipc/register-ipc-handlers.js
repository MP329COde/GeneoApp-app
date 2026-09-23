import { ipcMain } from 'electron';
import { buildIpcHandlers } from './build-handlers.js';

/**
 * Enregistre auprès d'ipcMain les handlers du canal IPC sécurisé (préload +
 * contextBridge). Réutilise les mêmes services que l'API Express : la
 * validation d'entrée et les règles métier ne sont écrites qu'une fois.
 * Retourne une fonction de nettoyage (à appeler à la fermeture de l'app).
 */
export function registerIpcHandlers(services, workspace = null) {
  const handlers = buildIpcHandlers(services, workspace);

  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, (_event, payload) => handler(payload));
  }

  return () => {
    for (const channel of Object.keys(handlers)) {
      ipcMain.removeHandler(channel);
    }
  };
}
