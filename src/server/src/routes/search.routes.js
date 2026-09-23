import { Router } from 'express';
import { createSearchController } from '../controllers/search.controller.js';

export function searchRoutes(services) {
  const controller = createSearchController(services);
  const router = Router();

  router.get('/duplicates', controller.duplicates);
  router.get('/merge/preview', controller.previewMerge);
  router.post('/merge', controller.mergePersons);
  router.get('/', controller.search);
  router.post('/advanced', (request, response) =>
    response.json(services.advancedSearch.search(request.body ?? {})),
  );

  return router;
}
