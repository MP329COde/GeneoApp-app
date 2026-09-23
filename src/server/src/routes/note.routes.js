import { Router } from 'express';
import { createNoteController } from '../controllers/note.controller.js';

export function noteRoutes(services) {
  const controller = createNoteController(services);
  const router = Router();
  router.post('/', controller.create);
  router.get('/', (request, response) => response.json(services.notes.listAll(request.query)));
  router.patch('/by-id/:id', (request, response) =>
    response.json(
      services.notes.update(request.params.id, request.body, { performedBy: request.performedBy }),
    ),
  );
  router.delete('/by-id/:id', (request, response) => {
    services.notes.remove(request.params.id, { performedBy: request.performedBy });
    response.status(204).end();
  });
  router.get('/:entityType/:entityId', controller.listForEntity);
  router.get('/by-id/:id', controller.get);
  return router;
}
