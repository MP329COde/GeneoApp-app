function parseDepth(rawDepth) {
  if (rawDepth === undefined) return undefined;
  const depth = Number(rawDepth);
  return depth;
}

export function createGraphController(services) {
  const { graph } = services;
  return {
    ancestors(request, response) {
      const maxDepth = parseDepth(request.query.depth);
      response.json(graph.getAncestors(Number(request.params.id), { maxDepth }));
    },
    descendants(request, response) {
      const maxDepth = parseDepth(request.query.depth);
      response.json(graph.getDescendants(Number(request.params.id), { maxDepth }));
    },
    relations(request, response) {
      response.json(graph.getRelations(Number(request.params.id)));
    },
    relationship(request, response) {
      const personA = Number(request.query.personA);
      const personB = Number(request.query.personB);
      graph.assertPair(personA, personB);
      response.json(graph.findRelationship(personA, personB));
    },
    commonAncestors(request, response) {
      const personA = Number(request.query.personA);
      const personB = Number(request.query.personB);
      graph.assertPair(personA, personB);
      response.json(graph.findCommonAncestors(personA, personB));
    },
    cycles(_request, response) {
      response.json(graph.detectCycles());
    },
    timeline(_request, response) {
      response.json(graph.validateTimeline());
    },
  };
}
