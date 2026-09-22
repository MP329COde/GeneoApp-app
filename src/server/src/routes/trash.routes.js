import { Router } from 'express';
import { createTrashController } from '../controllers/trash.controller.js';
import { requireSession } from '../middleware/require-session.js';

export function trashRoutes(services) {
  const controller = createTrashController(services);
  const router = Router();

  router.get('/', controller.list);
  router.post('/:table/:id/restore', requireSession(services), controller.restore);
  router.delete('/:table/:id', requireSession(services), controller.purge);

  return router;
}
