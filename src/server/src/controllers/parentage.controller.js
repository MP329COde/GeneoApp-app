export function createParentageController(services) {
  const { parentages } = services;

  return {
    create(request, response) {
      const parentage = parentages.create(request.body, { performedBy: request.performedBy });
      response.status(201).json(parentage);
    },

    get(request, response) {
      const parentage = parentages.get(Number(request.params.id));
      response.json(parentage);
    },

    listParentsOf(request, response) {
      response.json(parentages.listParentsOf(Number(request.params.personId)));
    },

    listChildrenOf(request, response) {
      response.json(parentages.listChildrenOf(Number(request.params.personId)));
    },

    remove(request, response) {
      parentages.remove(Number(request.params.id), { performedBy: request.performedBy });
      response.status(204).end();
    },
  };
}
