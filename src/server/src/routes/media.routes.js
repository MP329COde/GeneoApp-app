import { Router } from 'express';
import { createMediaController } from '../controllers/media.controller.js';

export function mediaRoutes(services) {
  const controller = createMediaController(services);
  const router = Router();

  router.post('/', controller.upload);
  router.get('/:id', controller.get);
  router.get('/:id/content', controller.download);
  router.delete('/:id', controller.remove);
  router.get('/by-source/:sourceId', controller.listForSource);
  router.get('/by-entity/:entityType/:entityId', controller.listForEntity);

  return router;
}
