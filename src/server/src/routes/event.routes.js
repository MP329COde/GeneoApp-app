import { Router } from 'express';
import { createEventController } from '../controllers/event.controller.js';

export function eventRoutes(services) {
  const controller = createEventController(services);
  const router = Router();

  router.post('/', controller.create);
  router.get('/', controller.listAll);
  router.get('/:id', controller.get);
  router.get('/by-person/:personId', controller.listForPerson);
  router.post('/:id/participants', controller.addParticipant);
  router.delete('/:id', controller.remove);

  return router;
}
