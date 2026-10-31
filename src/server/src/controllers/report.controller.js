export function createReportController(services) {
  const { reports } = services;
  return {
    async book(request, response, next) {
      try {
        response.json(await reports.buildBook(request.body ?? {}));
      } catch (error) {
        next(error);
      }
    },
  };
}
