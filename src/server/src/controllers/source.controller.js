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

    list(_request, response) {
      response.json(sources.list());
    },

    update(request, response) {
      response.json(
        sources.update(Number(request.params.id), request.body, {
          performedBy: request.performedBy,
        }),
      );
    },

    remove(request, response) {
      sources.remove(Number(request.params.id), { performedBy: request.performedBy });
      response.status(204).end();
    },

    getCitation(request, response) {
      response.json(sources.getCitation(Number(request.params.citationId)));
    },

    updateCitation(request, response) {
      response.json(
        sources.updateCitation(Number(request.params.citationId), request.body, {
          performedBy: request.performedBy,
        }),
      );
    },

    removeCitation(request, response) {
      sources.removeCitation(Number(request.params.citationId), {
        performedBy: request.performedBy,
      });
      response.status(204).end();
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
