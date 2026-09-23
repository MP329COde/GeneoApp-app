import { Router } from 'express';
import { createPersonController } from '../controllers/person.controller.js';
import { createGraphController } from '../controllers/graph.controller.js';

export function personRoutes(services) {
  const controller = createPersonController(services);
  const graph = createGraphController(services);
  const router = Router();

  router.post('/', controller.create);
  router.get('/', controller.list);
  router.get('/:id', controller.get);
  router.patch('/:id', controller.update);
  router.delete('/:id', controller.remove);
  router.post('/:id/restore', controller.restore);
  router.get('/:id/ancestors', graph.ancestors);
  router.get('/:id/descendants', graph.descendants);
  router.get('/:id/relations', graph.relations);
  router.get('/:id/network', (request, response) =>
    response.json(
      services.graph.getNetwork(Number(request.params.id), {
        depth: request.query.depth ? Number(request.query.depth) : 2,
      }),
    ),
  );
  router.get('/:id/quality', (request, response) =>
    response.json(services.quality.forPerson(request.params.id)),
  );

  return router;
}
