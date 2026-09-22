export function createSourceController(services) {
  const { sources } = services;

  return {
    create(request, response) {
      const source = sources.create(request.body, { performedBy: request.performedBy });
      response.status(201).json(source);
    },

    get(request, response) {
      const source = sources.get(Number(request.params.id));
      response.json(source);
    },

    addCitation(request, response) {
      const citationId = sources.addCitation(request.body, { performedBy: request.performedBy });
      response.status(201).json({ id: citationId });
    },

    listCitationsForEntity(request, response) {
      const { entityType, entityId } = request.params;
      response.json(sources.listCitationsForEntity(entityType, Number(entityId)));
    },
  };
}
