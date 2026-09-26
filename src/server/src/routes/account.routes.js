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
  // L'authentification/autorisation fines (session protégée, self-only, PIN)
  // sont gérées dans AccountService.remove — voir règles (b) et (c).
  router.delete('/:id', controller.remove);

  return router;
}
