import { Router } from 'express';

// Annuler / rétablir (Ctrl+Z / Ctrl+Shift+Z) et liste des dernières actions.
export function historyRoutes(services) {
  const router = Router();
  router.get('/', (request, response) => {
    const limit = Math.min(Math.max(Number(request.query.limit) || 50, 1), 200);
    response.json({ ...services.history.status(), actions: services.history.list(limit) });
  });
  router.post('/undo', (_request, response) => response.json(services.history.undo()));
  router.post('/redo', (_request, response) => response.json(services.history.redo()));
  return router;
}
