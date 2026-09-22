import { Router } from 'express';
import { createUnionController } from '../controllers/union.controller.js';

export function unionRoutes(services) {
  const controller = createUnionController(services);
  const router = Router();

  router.post('/', controller.create);
  router.get('/:id', controller.get);
  router.get('/by-person/:personId', controller.listForPerson);
  router.delete('/:id', controller.remove);

  return router;
}
