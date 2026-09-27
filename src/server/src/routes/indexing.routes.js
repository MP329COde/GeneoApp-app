import { Router } from 'express';

// Indexation de documents (ADR 0011, 0012) : sources, réglages, exécution,
// annulation, recherche et lecture d'un document indexé.
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
    handle((request) =>
      request.query.page === '1'
        ? indexing().searchPage(request.query.q, request.query)
        : indexing().search(request.query.q, request.query.limit),
    ),
  );
  router.get(
    '/presets',
    handle(() => indexing().presets()),
  );
  router.get(
    '/documents/:id',
    handle((request) => indexing().getDocument(request.params.id)),
  );
  router.post(
    '/sources',
    handle((request) => indexing().addSource(request.body), 201),
  );
  router.patch(
    '/sources/:id',
    handle((request) => indexing().updateSource(request.params.id, request.body ?? {})),
  );
  router.post(
    '/sources/:id/run',
    handle((request) => indexing().runSource(request.params.id)),
  );
  router.post(
    '/sources/:id/clear',
    handle((request) => indexing().clearSource(request.params.id)),
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
  router.post(
    '/run/cancel',
    handle(() => indexing().cancel()),
  );
  return router;
}
