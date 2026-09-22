export function createBackupController(services) {
  const { backups } = services;

  return {
    async create(request, response, next) {
      try {
        const meta = await backups.create(request.body, { performedBy: request.performedBy });
        response.status(201).json(meta);
      } catch (error) {
        next(error);
      }
    },

    async list(request, response, next) {
      try {
        response.json(await backups.list());
      } catch (error) {
        next(error);
      }
    },

    async verify(request, response, next) {
      try {
        response.json(await backups.verify(request.params.filename));
      } catch (error) {
        next(error);
      }
    },

    async restore(request, response, next) {
      try {
        const kind = request.query.kind === 'sqlite' ? 'sqlite' : 'logical';
        const result =
          kind === 'sqlite'
            ? await backups.restoreFile(request.params.filename)
            : await backups.restoreLogical(request.params.filename, {
                performedBy: request.performedBy,
              });
        response.json(result);
      } catch (error) {
        next(error);
      }
    },
  };
}
