import { Router } from 'express';
import { createAssertionController } from '../controllers/assertion.controller.js';

export function assertionRoutes(services) {
  const controller = createAssertionController(services);
  const router = Router();

  router.post('/', controller.create);
  router.get('/', controller.list);
  // Avant « /:id » : « conflicts » ne doit pas être pris pour un identifiant.
  router.get('/conflicts', controller.conflicts);
  router.get('/:id', controller.get);
  router.patch('/:id', controller.update);
  router.post('/:id/accept', controller.setStatus('ACCEPTED'));
  router.post('/:id/reject', controller.setStatus('REJECTED'));
  router.post('/:id/reopen', controller.setStatus('PROPOSED'));
  router.post('/:id/restore', controller.restore);
  router.delete('/:id', controller.remove);

  return router;
}
