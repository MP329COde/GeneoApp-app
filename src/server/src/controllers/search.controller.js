export function createSearchController(services) {
  const { search } = services;

  return {
    search(request, response) {
      const results = search.search({
        q: request.query.q,
        entityTypes: request.query.entityTypes,
        limit: request.query.limit !== undefined ? Number(request.query.limit) : undefined,
      });
      response.json(results);
    },
  };
}
