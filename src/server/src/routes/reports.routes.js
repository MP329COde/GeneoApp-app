import { Router } from 'express';
import { createStatisticsController } from '../controllers/statistics.controller.js';
import { createReportController } from '../controllers/report.controller.js';

export function reportsRoutes(services) {
  const controller = createStatisticsController(services);
  const reportController = createReportController(services);
  const router = Router();
  router.get('/summary', controller.summary);
  // Livre généalogique PDF (corps JSON → fichier en base64, comme l'export GEDZIP).
  router.post('/book', reportController.book);
  return router;
}
