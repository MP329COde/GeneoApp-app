export function createAuditController(services) {
  const { audit } = services;

  return {
    listForEntity(request, response) {
      const { tableName, rowId } = request.params;
      response.json(audit.listForEntity(tableName, Number(rowId)));
    },

    purge(request, response) {
      const days = request.body?.days;
      response.json(audit.purgeOlderThan(days));
    },
  };
}
