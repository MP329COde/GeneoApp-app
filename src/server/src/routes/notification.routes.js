import { Router } from 'express';
import { createNotificationController } from '../controllers/notification.controller.js';

export function notificationRoutes(services) {
  const controller = createNotificationController(services);
  const router = Router();

  router.get('/', controller.list);
  router.post('/', controller.publish);
  router.post('/read-all', controller.markAllRead);
  router.post('/:id/read', controller.markRead);

  return router;
}
