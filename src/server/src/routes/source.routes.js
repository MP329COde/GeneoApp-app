import { Router } from 'express';
import { createSourceController } from '../controllers/source.controller.js';

export function sourceRoutes(services) {
  const controller = createSourceController(services);
  const router = Router();

  router.post('/', controller.create);
  router.get('/:id', controller.get);
  router.post('/citations', controller.addCitation);
  router.get('/citations/:entityType/:entityId', controller.listCitationsForEntity);

  return router;
}
