export function createMediaController(services) {
  const { media } = services;

  return {
    async upload(request, response) {
      const record = await media.upload(request.body, { performedBy: request.performedBy });
      response.status(201).json(record);
    },

    get(request, response) {
      response.json(media.get(Number(request.params.id)));
    },

    async download(request, response) {
      const { media: record, content } = await media.download(Number(request.params.id));
      response.set('Content-Type', record.mime_type);
      response.set(
        'Content-Disposition',
        `inline; filename="${encodeURIComponent(record.original_filename)}"`,
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
  };
}
