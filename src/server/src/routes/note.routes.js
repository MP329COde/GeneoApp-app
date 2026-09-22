import { Router } from 'express';
import { createNoteController } from '../controllers/note.controller.js';

export function noteRoutes(services) {
  const controller = createNoteController(services);
  const router = Router();
  router.post('/', controller.create);
  router.get('/:entityType/:entityId', controller.listForEntity);
  router.get('/by-id/:id', controller.get);
  return router;
}
