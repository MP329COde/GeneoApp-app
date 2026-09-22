import { Router } from 'express';
import { createStatisticsController } from '../controllers/statistics.controller.js';

export function reportsRoutes(services) {
  const controller = createStatisticsController(services);
  const router = Router();
  router.get('/summary', controller.summary);
  return router;
}
