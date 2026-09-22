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
  };
}
