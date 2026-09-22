import { Router } from 'express';
import { createSearchController } from '../controllers/search.controller.js';

export function searchRoutes(services) {
  const controller = createSearchController(services);
  const router = Router();

  router.get('/', controller.search);

  return router;
}
