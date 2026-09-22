import express from 'express';
import { createServices } from './services/index.js';
import { apiRoutes } from './routes/index.js';
import { performedBy } from './middleware/performed-by.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';

/**
 * Construit l'application Express. La base de données est injectée pour
 * permettre son remplacement par une instance en mémoire dans les tests
 * (voir `createDatabase` pour l'usage réel avec SQLite fichier).
 */
export function createApp({ database, mediaRoot, backupDir } = {}) {
  if (!database) {
    throw new Error('createApp requiert une instance de base de données (option "database")');
  }

  const services = createServices(database, {
    ...(mediaRoot ? { mediaRoot } : {}),
    ...(backupDir ? { backupDir } : {}),
  });
  const app = express();

  app.use(express.json({ limit: '40mb' }));
  app.use(performedBy);

  app.get('/health', (_request, response) => {
    response.json({ status: 'ok' });
  });

  app.use('/api', apiRoutes(services));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
