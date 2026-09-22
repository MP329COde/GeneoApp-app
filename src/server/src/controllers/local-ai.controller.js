export function createLocalAiController(services) {
  const { localAi } = services;
  return {
    async analyze(request, response, next) {
      try {
        response.json(await localAi.analyze(request.body));
      } catch (error) {
        next(error);
      }
    },
  };
}
