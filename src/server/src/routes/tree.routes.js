import { Router } from 'express';
import { requireProtectedSession } from '../middleware/require-session.js';

// Catalogue des arbres : lister, créer, renommer, ouvrir, supprimer (logique)
// et restaurer. Changer d'arbre bascule toute l'API sur l'autre base.
// Suppression et restauration détruisent ou ramènent des données réelles :
// elles suivent la même règle que sauvegardes/corbeille/stockage
// (requireProtectedSession, voir contre-audit, point 4).
export function treeRoutes(workspace, services) {
  const router = Router();

  router.get('/', (_request, response) => response.json(workspace.list()));
  router.get('/active', (_request, response) => response.json(workspace.active()));
  router.get('/deleted', (_request, response) => response.json(workspace.listDeleted()));
  router.post('/', (request, response) =>
    response.status(201).json(workspace.create(request.body)),
  );
  router.patch('/:id', (request, response) =>
    response.json(workspace.update(request.params.id, request.body)),
  );
  router.post('/:id/activate', (request, response) =>
    response.json(workspace.activate(request.params.id)),
  );
  router.post('/:id/restore', requireProtectedSession(services), (request, response) =>
    response.json(workspace.restore(request.params.id)),
  );
  router.delete('/:id', requireProtectedSession(services), (request, response) =>
    response.json(workspace.remove(request.params.id)),
  );

  return router;
}
