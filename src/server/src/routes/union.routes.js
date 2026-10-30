import { Router } from 'express';
import { createUnionController } from '../controllers/union.controller.js';

export function unionRoutes(services) {
  const controller = createUnionController(services);
  const router = Router();

  router.post('/', controller.create);
  router.get('/', controller.list);
  router.get('/by-person/:personId', controller.listForPerson);
  router.get('/families-of/:personId', controller.familiesOfPerson);
  router.get('/:id/family', controller.family);
  router.get('/:id', controller.get);
  router.patch('/:id', controller.update);
  router.post('/:id/partners', controller.addPartner);
  router.delete('/:id/partners/:personId', controller.removePartner);
  router.delete('/:id', controller.remove);

  return router;
}
