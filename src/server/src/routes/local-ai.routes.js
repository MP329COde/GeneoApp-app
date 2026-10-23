import { Router } from 'express';
import { createLocalAiController } from '../controllers/local-ai.controller.js';

export function localAiRoutes(services) {
  const controller = createLocalAiController(services);
  const router = Router();
  router.get('/status', controller.status);
  router.put('/config', controller.updateConfig);
  router.post('/analyze', controller.analyze);
  router.post('/suggest', controller.suggest);
  return router;
}
