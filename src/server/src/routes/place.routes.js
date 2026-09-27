import { Router } from 'express';
import { createPlaceController } from '../controllers/place.controller.js';

export function placeRoutes(services) {
  const controller = createPlaceController(services);
  const router = Router();

  router.post('/', controller.create);
  router.get('/', controller.list);
  router.get('/auto-locate/preview', controller.previewAutoLocate);
  router.post('/auto-locate/apply', controller.applyAutoLocate);
  router.get('/:id', controller.get);
  router.delete('/:id', controller.remove);

  return router;
}
