import { Router } from 'express';
import { createParentageController } from '../controllers/parentage.controller.js';

export function parentageRoutes(services) {
  const controller = createParentageController(services);
  const router = Router();

  router.post('/', controller.create);
  router.get('/:id', controller.get);
  router.get('/parents-of/:personId', controller.listParentsOf);
  router.get('/children-of/:personId', controller.listChildrenOf);
  router.delete('/:id', controller.remove);

  return router;
}
