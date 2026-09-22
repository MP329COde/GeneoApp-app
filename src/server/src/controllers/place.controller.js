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
  };
}
