import { Router } from 'express';
import { createAccountController } from '../controllers/account.controller.js';
import { requireSession } from '../middleware/require-session.js';

export function accountRoutes(services) {
  const controller = createAccountController(services);
  const router = Router();

  router.post('/', controller.create);
  router.get('/', controller.list);
  router.post('/login', controller.login);
  router.post('/logout', requireSession(services), controller.logout);
  router.delete('/:id', requireSession(services), controller.remove);

  return router;
}
