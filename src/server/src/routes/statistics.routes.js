import { Router } from 'express';
import { createStatisticsController } from '../controllers/statistics.controller.js';

export function statisticsRoutes(services) {
  const controller = createStatisticsController(services);
  const router = Router();
  router.get('/', controller.totals);
  return router;
}
