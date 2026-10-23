export function createLocalAiController(services) {
  const { localAi } = services;
  const handle = (action) => async (request, response, next) => {
    try {
      response.json(await action(request));
    } catch (error) {
      next(error);
    }
  };
  return {
    analyze: handle((request) => localAi.analyze(request.body)),
    status: handle(() => localAi.status()),
    updateConfig: handle((request) => {
      localAi.updateConfig(request.body);
      return localAi.status();
    }),
    suggest: handle((request) => localAi.suggest(request.body)),
  };
}
