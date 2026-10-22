import { Router } from 'express';
import { createGraphController } from '../controllers/graph.controller.js';

export function graphRoutes(services) {
  const controller = createGraphController(services);
  const router = Router();

  router.get('/relationship', controller.relationship);
  router.get('/path', controller.path);
  router.get('/common-ancestors', controller.commonAncestors);
  router.get('/cycles', controller.cycles);
  router.get('/consistency', controller.consistency);
  router.get('/timeline', controller.timeline);

  return router;
}
