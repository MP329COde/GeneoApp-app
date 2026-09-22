export function createAuditController(services) {
  const { audit } = services;

  return {
    listForEntity(request, response) {
      const { tableName, rowId } = request.params;
      response.json(audit.listForEntity(tableName, Number(rowId)));
    },
  };
}
