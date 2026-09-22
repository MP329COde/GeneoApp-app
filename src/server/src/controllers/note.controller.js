export function createNoteController(services) {
  const { notes } = services;
  return {
    create(request, response) {
      response.status(201).json(notes.create(request.body, { performedBy: request.performedBy }));
    },
    listForEntity(request, response) {
      response.json(
        notes.listForEntity(request.params.entityType, Number(request.params.entityId)),
      );
    },
    get(request, response) {
      response.json(notes.get(Number(request.params.id)));
    },
  };
}
