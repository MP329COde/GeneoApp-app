export function createGedcomController(services) {
  const { gedcom } = services;

  return {
    preview(request, response) {
      response.json(gedcom.preview(request.body?.gedcom));
    },

    import(request, response) {
      const report = gedcom.import(request.body?.gedcom, { performedBy: request.performedBy });
      response.status(report.imported ? 201 : 422).json(report);
    },

    export(request, response) {
      response.json(gedcom.export(request.body ?? {}));
    },

    async exportArchive(request, response, next) {
      try {
        response.json(await gedcom.exportArchive(request.body ?? {}));
      } catch (error) {
        next(error);
      }
    },

    async importArchive(request, response, next) {
      try {
        const report = await gedcom.importArchive(request.body?.contentBase64, {
          performedBy: request.performedBy,
        });
        response.status(report.imported ? 201 : 422).json(report);
      } catch (error) {
        next(error);
      }
    },
  };
}
