export function createEventController(services) {
  const { events } = services;

  return {
    create(request, response) {
      const event = events.create(request.body, { performedBy: request.performedBy });
      response.status(201).json(event);
    },

    get(request, response) {
      const event = events.get(Number(request.params.id));
      response.json(event);
    },

    listAll(request, response) {
      response.json(events.listAll());
    },

    listForPerson(request, response) {
      response.json(events.listForPerson(Number(request.params.personId)));
    },

    addParticipant(request, response) {
      const participantId = events.addParticipant(Number(request.params.id), request.body, {
        performedBy: request.performedBy,
      });
      response.status(201).json({ id: participantId });
    },

    update(request, response) {
      response.json(
        events.update(Number(request.params.id), request.body, {
          performedBy: request.performedBy,
        }),
      );
    },

    removeParticipant(request, response) {
      events.removeParticipant(Number(request.params.id), Number(request.params.participantId), {
        performedBy: request.performedBy,
      });
      response.status(204).end();
    },

    remove(request, response) {
      events.remove(Number(request.params.id), { performedBy: request.performedBy });
      response.status(204).end();
    },
  };
}
