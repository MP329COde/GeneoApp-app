import { Router } from 'express';
import { requireSession } from '../middleware/require-session.js';

// Emplacements de stockage : dossier de travail portable et miroir des sauvegardes.
export function storageRoutes(storage, services) {
  const router = Router();
  const handle = (fn) => async (request, response, next) => {
    try {
      response.json(await fn(request));
    } catch (error) {
      next(error);
    }
  };
  router.get(
    '/',
    handle(() => storage.status()),
  );
  router.put(
    '/mirror',
    requireSession(services),
    handle((request) => storage.setMirrorDir(request.body?.mirrorDir ?? null)),
  );
  router.put(
    '/data-dir',
    requireSession(services),
    handle((request) => storage.setDataDir(request.body?.dataDir ?? null)),
  );
  return router;
}
