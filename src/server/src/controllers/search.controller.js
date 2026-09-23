export function createSearchController(services) {
  const { search, merge } = services;

  return {
    search(request, response) {
      const results = search.search({
        q: request.query.q,
        entityTypes: request.query.entityTypes,
        limit: request.query.limit !== undefined ? Number(request.query.limit) : undefined,
      });
      response.json(results);
    },

    duplicates(request, response) {
      response.json(search.potentialDuplicates({ limit: Number(request.query.limit) || 100 }));
    },

    mergePersons(request, response) {
      const { survivorId, duplicateId } = request.body ?? {};
      const merged = merge.mergePersons(Number(survivorId), Number(duplicateId), {
        performedBy: request.performedBy,
      });
      response.json(merged);
    },

    previewMerge(request, response) {
      const survivorId = Number(request.query.survivorId);
      const duplicateId = Number(request.query.duplicateId);
      response.json(merge.previewPersons(survivorId, duplicateId));
    },
  };
}
