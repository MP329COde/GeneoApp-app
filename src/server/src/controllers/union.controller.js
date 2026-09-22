export function createUnionController(services) {
  const { unions } = services;

  return {
    create(request, response) {
      const union = unions.create(request.body, { performedBy: request.performedBy });
      response.status(201).json(union);
    },

    get(request, response) {
      const union = unions.get(Number(request.params.id));
      response.json(union);
    },

    listForPerson(request, response) {
      response.json(unions.listForPerson(Number(request.params.personId)));
    },

    remove(request, response) {
      unions.remove(Number(request.params.id), { performedBy: request.performedBy });
      response.status(204).end();
    },
  };
}
