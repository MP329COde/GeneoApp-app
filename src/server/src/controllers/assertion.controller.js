export function createAssertionController(services) {
  const { assertions } = services;

  return {
    create(request, response) {
      const assertion = assertions.create(request.body, { performedBy: request.performedBy });
      response.status(201).json(assertion);
    },

    list(request, response) {
      response.json(assertions.list(request.query));
    },

    conflicts(request, response) {
      response.json(assertions.conflicts(request.query));
    },

    get(request, response) {
      response.json(assertions.get(Number(request.params.id)));
    },

    update(request, response) {
      response.json(
        assertions.update(Number(request.params.id), request.body, {
          performedBy: request.performedBy,
        }),
      );
    },

    // Retenir / écarter / remettre en discussion : actions explicites.
    setStatus(status) {
      return (request, response) => {
        response.json(
          assertions.setStatus(Number(request.params.id), status, {
            performedBy: request.performedBy,
          }),
        );
      };
    },

    remove(request, response) {
      assertions.remove(Number(request.params.id), { performedBy: request.performedBy });
      response.status(204).end();
    },

    restore(request, response) {
      response.json(
        assertions.restore(Number(request.params.id), { performedBy: request.performedBy }),
      );
    },
  };
}
