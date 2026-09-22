import { Router } from 'express';
import { createLocalAiController } from '../controllers/local-ai.controller.js';

export function localAiRoutes(services) {
  const controller = createLocalAiController(services);
  const router = Router();
  router.post('/analyze', controller.analyze);
  return router;
}
