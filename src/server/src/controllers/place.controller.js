export function createPlaceController(services) {
  const { places } = services;

  return {
    create(request, response) {
      const place = places.create(request.body, { performedBy: request.performedBy });
      response.status(201).json(place);
    },

    get(request, response) {
      const place = places.get(Number(request.params.id));
      response.json(place);
    },

    list(request, response) {
      const includeDeleted = request.query.includeDeleted === 'true';
      response.json(places.list({ includeDeleted }));
    },

    update(request, response) {
      response.json(
        places.update(Number(request.params.id), request.body, {
          performedBy: request.performedBy,
        }),
      );
    },

    listNames(request, response) {
      response.json(places.listNames(Number(request.params.id)));
    },

    addName(request, response) {
      const name = places.addName(Number(request.params.id), request.body, {
        performedBy: request.performedBy,
      });
      response.status(201).json(name);
    },

    removeName(request, response) {
      places.removeName(Number(request.params.id), Number(request.params.nameId), {
        performedBy: request.performedBy,
      });
      response.status(204).end();
    },

    listParents(request, response) {
      response.json(places.listParents(Number(request.params.id)));
    },

    addParent(request, response) {
      const link = places.addParent(Number(request.params.id), request.body, {
        performedBy: request.performedBy,
      });
      response.status(201).json(link);
    },

    removeParent(request, response) {
      places.removeParent(Number(request.params.id), Number(request.params.parentLinkId), {
        performedBy: request.performedBy,
      });
      response.status(204).end();
    },

    resolve(request, response) {
      response.json(places.resolve(Number(request.params.id), request.query.year));
    },

    remove(request, response) {
      places.remove(Number(request.params.id), { performedBy: request.performedBy });
      response.status(204).end();
    },

    previewAutoLocate(_request, response) {
      response.json(places.previewAutoLocate());
    },

    applyAutoLocate(request, response) {
      const updated = places.applyAutoLocate(request.body?.assignments);
      response.json({ updated });
    },
  };
}
