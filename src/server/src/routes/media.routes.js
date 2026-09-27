import { Router } from 'express';
import { createMediaController } from '../controllers/media.controller.js';

export function mediaRoutes(services) {
  const controller = createMediaController(services);
  const router = Router();

  router.post('/', controller.upload);
  router.post('/identify', async (request, response) =>
    response.json(await services.documents.identify(request.body)),
  );
  router.get('/photos/by-person/:personId', controller.photosForPerson);
  router.delete('/regions/:regionId', controller.removeRegion);
  router.get('/:id', controller.get);
  router.get('/:id/photo', controller.photo);
  router.patch('/:id/photo', controller.updatePhoto);
  router.post('/:id/regions', controller.addRegion);
  router.get('/:id/content', controller.download);
  router.post('/:id/decode', async (request, response) =>
    response.json(await services.documents.decode(request.params.id, request.body ?? {})),
  );
  router.put('/:id/transcription', (request, response) =>
    response.json(services.documents.saveTranscription(request.params.id, request.body ?? {})),
  );
  router.get('/:id/owners', (request, response) =>
    response.json(services.documents.owners(request.params.id)),
  );
  router.put('/:id/link', (request, response) =>
    response.json(
      services.documents.link(request.params.id, request.body ?? {}, {
        performedBy: request.performedBy,
      }),
    ),
  );
  router.delete('/:id', controller.remove);
  router.get('/by-source/:sourceId', controller.listForSource);
  router.get('/by-entity/:entityType/:entityId', controller.listForEntity);

  return router;
}
