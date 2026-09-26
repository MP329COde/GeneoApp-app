import express from 'express';
import { createServices } from './services/index.js';
import { apiRoutes } from './routes/index.js';
import { performedBy } from './middleware/performed-by.js';
import { dnsRebindingProtection } from './middleware/dns-rebinding-protection.js';
import { treeRoutes } from './routes/tree.routes.js';
import { storageRoutes } from './routes/storage.routes.js';
import { createLiveServices } from './trees/tree-workspace.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';

/**
 * Construit l'application Express. La base de données est injectée pour
 * permettre son remplacement par une instance en mémoire dans les tests
 * (voir `createDatabase` pour l'usage réel avec SQLite fichier).
 */
export function createApp({ database, mediaRoot, backupDir, services, workspace, storage } = {}) {
  if (workspace) services ??= createLiveServices(workspace);
  if (!database && !services) {
    throw new Error('createApp requiert une instance de base de données (option "database")');
  }

  services ??= createServices(database, {
    ...(mediaRoot ? { mediaRoot } : {}),
    ...(backupDir ? { backupDir } : {}),
  });
  const app = express();

  app.use(dnsRebindingProtection());
  app.use(express.json({ limit: '40mb' }));
  app.use(performedBy);

  app.get('/health', (_request, response) => {
    response.json({ status: 'ok' });
  });

  if (workspace) app.use('/api/trees', treeRoutes(workspace));
  if (storage) app.use('/api/storage', storageRoutes(storage, services));
  app.use('/api', apiRoutes(services));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
