function parseDepth(rawDepth) {
  if (rawDepth === undefined) return undefined;
  const depth = Number(rawDepth);
  return depth;
}

function parseLinkTypes(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return undefined;
  return raw
    .split(',')
    .map((type) => type.trim().toUpperCase())
    .filter(Boolean);
}

export function createGraphController(services) {
  const { graph } = services;
  return {
    ancestors(request, response) {
      const maxDepth = parseDepth(request.query.depth);
      response.json(
        graph.getAncestors(Number(request.params.id), {
          maxDepth,
          linkTypes: parseLinkTypes(request.query.linkTypes),
        }),
      );
    },
    descendants(request, response) {
      const maxDepth = parseDepth(request.query.depth);
      response.json(
        graph.getDescendants(Number(request.params.id), {
          maxDepth,
          linkTypes: parseLinkTypes(request.query.linkTypes),
        }),
      );
    },
    relations(request, response) {
      response.json(graph.getRelations(Number(request.params.id)));
    },
    relationship(request, response) {
      const personA = Number(request.query.personA);
      const personB = Number(request.query.personB);
      graph.assertPair(personA, personB);
      response.json(
        graph.findRelationship(personA, personB, { maxDepth: parseDepth(request.query.depth) }),
      );
    },
    commonAncestors(request, response) {
      const personA = Number(request.query.personA);
      const personB = Number(request.query.personB);
      graph.assertPair(personA, personB);
      response.json(
        graph.findCommonAncestors(personA, personB, {
          maxDepth: parseDepth(request.query.depth),
          linkTypes: parseLinkTypes(request.query.linkTypes),
        }),
      );
    },
    path(request, response) {
      const personA = Number(request.query.personA);
      const personB = Number(request.query.personB);
      graph.assertPair(personA, personB);
      const maxDepth = parseDepth(request.query.depth);
      const limit = request.query.limit === undefined ? undefined : Number(request.query.limit);
      response.json(graph.findPaths(personA, personB, { maxDepth, limit }));
    },
    cycles(_request, response) {
      response.json(graph.detectCycles());
    },
    timeline(_request, response) {
      response.json(graph.validateTimeline());
    },
  };
}
