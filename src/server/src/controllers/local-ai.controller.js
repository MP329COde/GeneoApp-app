export function createLocalAiController(services) {
  const { localAi } = services;
  return {
    analyze(request, response) {
      response.json(localAi.analyze(request.body));
    },
  };
}
