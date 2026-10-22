import { Router } from 'express';
import { createSourceController } from '../controllers/source.controller.js';

export function sourceRoutes(services) {
  const controller = createSourceController(services);
  const router = Router();

  router.post('/', controller.create);
  router.get('/', controller.list);
  router.post('/citations', controller.addCitation);
  router.get('/citations/:entityType/:entityId', controller.listCitationsForEntity);
  // Avant « /:id » : « citations » ne doit pas être pris pour un identifiant.
  router.get('/citation/:citationId', controller.getCitation);
  router.patch('/citation/:citationId', controller.updateCitation);
  router.delete('/citation/:citationId', controller.removeCitation);
  router.get('/:id', controller.get);
  router.patch('/:id', controller.update);
  router.delete('/:id', controller.remove);

  return router;
}
