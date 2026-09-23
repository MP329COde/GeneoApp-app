import { Router } from 'express';

// Indexation de documents (ADR 0011) : sources, réglages, exécution, recherche.
export function indexingRoutes(services) {
  const router = Router();
  const handle =
    (fn, status = 200) =>
    async (request, response, next) => {
      try {
        const result = await fn(request);
        if (result === undefined) response.status(204).end();
        else response.status(status).json(result);
      } catch (error) {
        next(error);
      }
    };
  const indexing = () => services.indexing;
  router.get(
    '/',
    handle(() => indexing().status()),
  );
  router.get(
    '/search',
    handle((request) => indexing().search(request.query.q, request.query.limit)),
  );
  router.post(
    '/sources',
    handle((request) => indexing().addSource(request.body), 201),
  );
  router.patch(
    '/sources/:id',
    handle((request) => indexing().setSourceEnabled(request.params.id, request.body?.enabled)),
  );
  router.delete(
    '/sources/:id',
    handle((request) => indexing().removeSource(request.params.id)),
  );
  router.patch(
    '/settings',
    handle((request) => indexing().updateSettings(request.body)),
  );
  router.post(
    '/run',
    handle(() => indexing().run('MANUAL')),
  );
  return router;
}
