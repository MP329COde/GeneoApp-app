import { Router } from 'express';
import { createResearchController } from '../controllers/research.controller.js';

export function researchRoutes(services) {
  const controller = createResearchController(services);
  const router = Router();
  router.post('/', controller.create);
  router.get('/', controller.list);
  return router;
}
