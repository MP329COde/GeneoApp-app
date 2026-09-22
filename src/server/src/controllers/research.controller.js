export function createResearchController(services) {
  const { research } = services;
  return {
    create(request, response) {
      response
        .status(201)
        .json(research.create(request.body, { performedBy: request.performedBy }));
    },
    list(_request, response) {
      response.json(research.list());
    },
  };
}
