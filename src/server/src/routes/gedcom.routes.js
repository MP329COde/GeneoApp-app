import { Router } from 'express';
import { createGedcomController } from '../controllers/gedcom.controller.js';

export function gedcomRoutes(services) {
  const controller = createGedcomController(services);
  const router = Router();

  router.post('/preview', controller.preview);
  router.post('/import', controller.import);
  router.post('/export', controller.export);
  router.post('/export-archive', controller.exportArchive);
  router.post('/import-archive', controller.importArchive);

  return router;
}
