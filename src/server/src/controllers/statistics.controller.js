export function createStatisticsController(services) {
  const { statistics } = services;
  return {
    totals(_request, response) {
      response.json({ totals: statistics.totals(), generatedAt: new Date().toISOString() });
    },
    summary(_request, response) {
      response.json({ summary: statistics.summary() });
    },
  };
}
