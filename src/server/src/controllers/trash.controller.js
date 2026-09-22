export function createTrashController(services) {
  const { trash } = services;

  return {
    list(request, response) {
      response.json(trash.list());
    },

    restore(request, response) {
      const { table, id } = request.params;
      const entity = trash.restore(table, Number(id), { performedBy: request.performedBy });
      response.json(entity);
    },

    purge(request, response) {
      const { table, id } = request.params;
      trash.purge(table, Number(id), { performedBy: request.performedBy });
      response.status(204).end();
    },
  };
}
