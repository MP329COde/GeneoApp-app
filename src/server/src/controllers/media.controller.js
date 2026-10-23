import { ValidationError } from '../errors.js';
import { validateMediaMetadata } from '../validation/schemas.js';

const optionalNumber = (value) => (value === undefined ? undefined : Number(value));

export function createMediaController(services) {
  const { media } = services;

  return {
    async upload(request, response) {
      const record = await media.upload(request.body, { performedBy: request.performedBy });
      response.status(201).json(record);
    },

    // Corps binaire brut (Content-Type quelconque) : nom et rattachement en paramètres.
    async uploadRaw(request, response) {
      const body = request.body;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        throw new ValidationError('Le corps de la requête doit contenir le fichier (octets bruts)');
      }
      const metadata = validateMediaMetadata({
        filename: request.query.filename,
        sourceId: optionalNumber(request.query.sourceId),
        entityType: request.query.entityType,
        entityId: optionalNumber(request.query.entityId),
        notes: request.query.notes,
      });
      const record = await media.uploadRaw(body, metadata, { performedBy: request.performedBy });
      response.status(201).json(record);
    },

    async addUrl(request, response) {
      const record = media.addUrl(request.body, { performedBy: request.performedBy });
      response.status(201).json(record);
    },

    listLinks(request, response) {
      response.json(media.listLinks(Number(request.params.id)));
    },

    addLink(request, response) {
      const link = media.addLink(Number(request.params.id), request.body, {
        performedBy: request.performedBy,
      });
      response.status(201).json(link);
    },

    removeLink(request, response) {
      media.removeLink(Number(request.params.id), Number(request.params.linkId), {
        performedBy: request.performedBy,
      });
      response.status(204).end();
    },

    get(request, response) {
      response.json(media.get(Number(request.params.id)));
    },

    async download(request, response) {
      const { media: record, content } = await media.download(Number(request.params.id));
      // Le type vient de la signature du contenu, jamais du nom : `nosniff`
      // empêche le navigateur de le réinterpréter. Un document Word est proposé
      // en téléchargement plutôt qu'ouvert dans l'application.
      const disposition = record.mime_type.includes('wordprocessingml') ? 'attachment' : 'inline';
      response.set('Content-Type', record.mime_type);
      response.set('X-Content-Type-Options', 'nosniff');
      response.set(
        'Content-Disposition',
        `${disposition}; filename="${encodeURIComponent(record.original_filename)}"`,
      );
      response.send(content);
    },

    listForSource(request, response) {
      response.json(media.listForSource(Number(request.params.sourceId)));
    },

    listForEntity(request, response) {
      const { entityType, entityId } = request.params;
      response.json(media.listForEntity(entityType, Number(entityId)));
    },

    remove(request, response) {
      media.remove(Number(request.params.id), { performedBy: request.performedBy });
      response.status(204).end();
    },

    photo(request, response) {
      response.json(services.photos.get(request.params.id));
    },

    updatePhoto(request, response) {
      response.json(
        services.photos.updateMetadata(request.params.id, request.body, {
          performedBy: request.performedBy,
        }),
      );
    },

    addRegion(request, response) {
      response.status(201).json(
        services.photos.addRegion(request.params.id, request.body, {
          performedBy: request.performedBy,
        }),
      );
    },

    removeRegion(request, response) {
      services.photos.removeRegion(request.params.regionId, { performedBy: request.performedBy });
      response.status(204).end();
    },

    photosForPerson(request, response) {
      response.json(services.photos.listForPerson(request.params.personId));
    },
  };
}
