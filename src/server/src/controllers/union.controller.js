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

    family(request, response) {
      response.json(unions.family(Number(request.params.id)));
    },

    familiesOfPerson(request, response) {
      response.json(unions.familiesOfPerson(Number(request.params.personId)));
    },

    list(_request, response) {
      response.json(unions.list());
    },

    update(request, response) {
      response.json(
        unions.update(Number(request.params.id), request.body, {
          performedBy: request.performedBy,
        }),
      );
    },

    addPartner(request, response) {
      response.status(201).json(
        unions.addPartner(Number(request.params.id), request.body, {
          performedBy: request.performedBy,
        }),
      );
    },

    removePartner(request, response) {
      response.json(
        unions.removePartner(Number(request.params.id), Number(request.params.personId), {
          performedBy: request.performedBy,
        }),
      );
    },

    remove(request, response) {
      unions.remove(Number(request.params.id), { performedBy: request.performedBy });
      response.status(204).end();
    },
  };
}
