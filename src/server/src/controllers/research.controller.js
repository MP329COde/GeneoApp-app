export function createResearchController(services) {
  const { research } = services;
  const actor = (request) => ({ performedBy: request.performedBy });
  return {
    create(request, response) {
      response.status(201).json(research.create(request.body, actor(request)));
    },
    list(_request, response) {
      response.json(research.list());
    },
    get(request, response) {
      response.json(research.get(request.params.id));
    },
    update(request, response) {
      response.json(research.update(request.params.id, request.body, actor(request)));
    },
    remove(request, response) {
      research.remove(request.params.id, actor(request));
      response.status(204).end();
    },
    addHypothesis(request, response) {
      response
        .status(201)
        .json(research.addHypothesis(request.params.id, request.body, actor(request)));
    },
    updateHypothesis(request, response) {
      response.json(research.updateHypothesis(request.params.id, request.body, actor(request)));
    },
    removeHypothesis(request, response) {
      research.removeHypothesis(request.params.id, actor(request));
      response.status(204).end();
    },
    addEvidence(request, response) {
      response
        .status(201)
        .json(research.addEvidence(request.params.id, request.body, actor(request)));
    },
    removeEvidence(request, response) {
      research.removeEvidence(request.params.id, actor(request));
      response.status(204).end();
    },
    addTask(request, response) {
      response.status(201).json(research.addTask(request.params.id, request.body, actor(request)));
    },
    updateTask(request, response) {
      response.json(research.updateTask(request.params.id, request.body, actor(request)));
    },
    removeTask(request, response) {
      research.removeTask(request.params.id, actor(request));
      response.status(204).end();
    },
  };
}
