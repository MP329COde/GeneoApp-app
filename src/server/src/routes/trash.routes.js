import { Router } from 'express';
import { createTrashController } from '../controllers/trash.controller.js';
import { requireProtectedSession } from '../middleware/require-session.js';

export function trashRoutes(services) {
  const controller = createTrashController(services);
  const router = Router();

  router.get('/', controller.list);
  router.post('/:table/:id/restore', requireProtectedSession(services), controller.restore);
  router.delete('/:table/:id', requireProtectedSession(services), controller.purge);

  return router;
}
