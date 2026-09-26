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
