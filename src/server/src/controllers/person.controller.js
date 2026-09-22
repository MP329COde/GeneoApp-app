export function createPersonController(services) {
  const { persons } = services;

  return {
    create(request, response) {
      const person = persons.create(request.body, { performedBy: request.performedBy });
      response.status(201).json(person);
    },

    get(request, response) {
      const person = persons.get(Number(request.params.id));
      response.json(person);
    },

    list(request, response) {
      const includeDeleted = request.query.includeDeleted === 'true';
      response.json(persons.list({ includeDeleted }));
    },

    update(request, response) {
      const person = persons.update(Number(request.params.id), request.body, {
        performedBy: request.performedBy,
      });
      response.json(person);
    },

    remove(request, response) {
      persons.remove(Number(request.params.id), { performedBy: request.performedBy });
      response.status(204).end();
    },

    restore(request, response) {
      const person = persons.restore(Number(request.params.id), {
        performedBy: request.performedBy,
      });
      response.json(person);
    },
  };
}
