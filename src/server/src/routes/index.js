import { Router } from 'express';
import { personRoutes } from './person.routes.js';
import { placeRoutes } from './place.routes.js';
import { eventRoutes } from './event.routes.js';
import { unionRoutes } from './union.routes.js';
import { parentageRoutes } from './parentage.routes.js';
import { sourceRoutes } from './source.routes.js';
import { mediaRoutes } from './media.routes.js';
import { searchRoutes } from './search.routes.js';
import { auditRoutes } from './audit.routes.js';
import { gedcomRoutes } from './gedcom.routes.js';
import { accountRoutes } from './account.routes.js';
import { trashRoutes } from './trash.routes.js';
import { backupRoutes } from './backup.routes.js';
import { graphRoutes } from './graph.routes.js';
import { noteRoutes } from './note.routes.js';
import { researchRoutes } from './research.routes.js';
import { statisticsRoutes } from './statistics.routes.js';
import { reportsRoutes } from './reports.routes.js';
import { localAiRoutes } from './local-ai.routes.js';

export function apiRoutes(services) {
  const router = Router();

  router.use('/persons', personRoutes(services));
  router.use('/places', placeRoutes(services));
  router.use('/events', eventRoutes(services));
  router.use('/unions', unionRoutes(services));
  router.use('/parentages', parentageRoutes(services));
  router.use('/sources', sourceRoutes(services));
  router.use('/media', mediaRoutes(services));
  router.use('/search', searchRoutes(services));
  router.use('/audit', auditRoutes(services));
  router.use('/gedcom', gedcomRoutes(services));
  router.use('/accounts', accountRoutes(services));
  router.use('/trash', trashRoutes(services));
  router.use('/backups', backupRoutes(services));
  router.use('/graph', graphRoutes(services));
  router.use('/notes', noteRoutes(services));
  router.use('/notebook', researchRoutes(services));
  router.use('/statistics', statisticsRoutes(services));
  router.use('/reports', reportsRoutes(services));
  router.use('/ai', localAiRoutes(services));

  return router;
}
