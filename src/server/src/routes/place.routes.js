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
  router.patch('/:id', controller.update);
  router.get('/:id/names', controller.listNames);
  router.post('/:id/names', controller.addName);
  router.delete('/:id/names/:nameId', controller.removeName);
  router.get('/:id/parents', controller.listParents);
  router.post('/:id/parents', controller.addParent);
  router.delete('/:id/parents/:parentLinkId', controller.removeParent);
  router.get('/:id/resolve', controller.resolve);
  router.delete('/:id', controller.remove);

  return router;
}
