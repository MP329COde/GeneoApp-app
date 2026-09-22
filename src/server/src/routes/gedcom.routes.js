import { Router } from 'express';
import { createGedcomController } from '../controllers/gedcom.controller.js';

export function gedcomRoutes(services) {
  const controller = createGedcomController(services);
  const router = Router();

  router.post('/preview', controller.preview);
  router.post('/import', controller.import);

  return router;
}
