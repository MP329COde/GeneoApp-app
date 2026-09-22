import { isPlainObject } from '../../../server/src/validation/validators.js';
import { ValidationError, toHttpError } from '../../../server/src/errors.js';
import { IPC_CHANNELS } from './channels.js';

function actorOf(performedBy) {
  return typeof performedBy === 'string' && performedBy.trim() !== ''
    ? performedBy.trim()
    : 'local-user';
}

/**
 * Enveloppe un handler métier : valide la forme du payload reçu du renderer
 * (jamais fait confiance), puis retourne une enveloppe sérialisable
 * `{ ok, data }` ou `{ ok: false, error }` — jamais une exception brute, pour
 * ne pas fuiter de détails d'implémentation (stack, chemins) côté renderer.
 */
function wrap(handler) {
  return async (payload) => {
    try {
      if (payload !== undefined && !isPlainObject(payload)) {
        throw new ValidationError('Le payload IPC doit être un objet');
      }
      const data = await handler(payload ?? {});
      return { ok: true, data };
    } catch (error) {
      const httpError = toHttpError(error);
      const status = httpError.status ?? 500;
      if (status >= 500) {
        console.error(error);
      }
      return {
        ok: false,
        error: {
          message: status >= 500 ? 'Erreur interne' : httpError.message,
          status,
          fields: httpError.fields,
        },
      };
    }
  };
}

/**
 * Construit la table canal IPC -> handler, indépendamment d'Electron, pour
 * pouvoir être testée en dehors du runtime Electron (ipcMain n'existe que
 * dans le processus principal Electron).
 */
export function buildIpcHandlers(services) {
  const { persons, places, events, unions, parentages, sources, audit, graph, search, gedcom } =
    services;

  return {
    [IPC_CHANNELS.PERSONS_CREATE]: wrap(({ data, performedBy }) =>
      persons.create(data, { performedBy: actorOf(performedBy) }),
    ),
    [IPC_CHANNELS.PERSONS_GET]: wrap(({ id }) => persons.get(id)),
    [IPC_CHANNELS.PERSONS_LIST]: wrap(({ includeDeleted } = {}) =>
      persons.list({ includeDeleted }),
    ),
    [IPC_CHANNELS.PERSONS_UPDATE]: wrap(({ id, data, performedBy }) =>
      persons.update(id, data, { performedBy: actorOf(performedBy) }),
    ),
    [IPC_CHANNELS.PERSONS_REMOVE]: wrap(({ id, performedBy }) =>
      persons.remove(id, { performedBy: actorOf(performedBy) }),
    ),
    [IPC_CHANNELS.PERSONS_RESTORE]: wrap(({ id, performedBy }) =>
      persons.restore(id, { performedBy: actorOf(performedBy) }),
    ),

    [IPC_CHANNELS.PLACES_CREATE]: wrap(({ data, performedBy }) =>
      places.create(data, { performedBy: actorOf(performedBy) }),
    ),
    [IPC_CHANNELS.PLACES_GET]: wrap(({ id }) => places.get(id)),
    [IPC_CHANNELS.PLACES_LIST]: wrap(({ includeDeleted } = {}) => places.list({ includeDeleted })),
    [IPC_CHANNELS.PLACES_REMOVE]: wrap(({ id, performedBy }) =>
      places.remove(id, { performedBy: actorOf(performedBy) }),
    ),

    [IPC_CHANNELS.EVENTS_CREATE]: wrap(({ data, performedBy }) =>
      events.create(data, { performedBy: actorOf(performedBy) }),
    ),
    [IPC_CHANNELS.EVENTS_GET]: wrap(({ id }) => events.get(id)),
    [IPC_CHANNELS.EVENTS_LIST_FOR_PERSON]: wrap(({ personId }) => events.listForPerson(personId)),
    [IPC_CHANNELS.EVENTS_ADD_PARTICIPANT]: wrap(({ id, data, performedBy }) =>
      events.addParticipant(id, data, { performedBy: actorOf(performedBy) }),
    ),
    [IPC_CHANNELS.EVENTS_REMOVE]: wrap(({ id, performedBy }) =>
      events.remove(id, { performedBy: actorOf(performedBy) }),
    ),

    [IPC_CHANNELS.UNIONS_CREATE]: wrap(({ data, performedBy }) =>
      unions.create(data, { performedBy: actorOf(performedBy) }),
    ),
    [IPC_CHANNELS.UNIONS_GET]: wrap(({ id }) => unions.get(id)),
    [IPC_CHANNELS.UNIONS_LIST_FOR_PERSON]: wrap(({ personId }) => unions.listForPerson(personId)),
    [IPC_CHANNELS.UNIONS_REMOVE]: wrap(({ id, performedBy }) =>
      unions.remove(id, { performedBy: actorOf(performedBy) }),
    ),

    [IPC_CHANNELS.PARENTAGES_CREATE]: wrap(({ data, performedBy }) =>
      parentages.create(data, { performedBy: actorOf(performedBy) }),
    ),
    [IPC_CHANNELS.PARENTAGES_GET]: wrap(({ id }) => parentages.get(id)),
    [IPC_CHANNELS.PARENTAGES_LIST_PARENTS_OF]: wrap(({ personId }) =>
      parentages.listParentsOf(personId),
    ),
    [IPC_CHANNELS.PARENTAGES_LIST_CHILDREN_OF]: wrap(({ personId }) =>
      parentages.listChildrenOf(personId),
    ),
    [IPC_CHANNELS.PARENTAGES_REMOVE]: wrap(({ id, performedBy }) =>
      parentages.remove(id, { performedBy: actorOf(performedBy) }),
    ),

    [IPC_CHANNELS.SOURCES_CREATE]: wrap(({ data, performedBy }) =>
      sources.create(data, { performedBy: actorOf(performedBy) }),
    ),
    [IPC_CHANNELS.SOURCES_GET]: wrap(({ id }) => sources.get(id)),
    [IPC_CHANNELS.SOURCES_ADD_CITATION]: wrap(({ data, performedBy }) =>
      sources.addCitation(data, { performedBy: actorOf(performedBy) }),
    ),
    [IPC_CHANNELS.SOURCES_LIST_CITATIONS_FOR_ENTITY]: wrap(({ entityType, entityId }) =>
      sources.listCitationsForEntity(entityType, entityId),
    ),

    [IPC_CHANNELS.AUDIT_LIST_FOR_ENTITY]: wrap(({ tableName, rowId }) =>
      audit.listForEntity(tableName, rowId),
    ),

    [IPC_CHANNELS.GRAPH_ANCESTORS]: wrap(({ personId, depth }) =>
      graph.getAncestors(personId, { maxDepth: depth }),
    ),
    [IPC_CHANNELS.GRAPH_DESCENDANTS]: wrap(({ personId, depth }) =>
      graph.getDescendants(personId, { maxDepth: depth }),
    ),
    [IPC_CHANNELS.GRAPH_RELATIONS]: wrap(({ personId }) => graph.getRelations(personId)),
    [IPC_CHANNELS.GRAPH_RELATIONSHIP]: wrap(({ personA, personB }) => {
      graph.assertPair(personA, personB);
      return graph.findRelationship(personA, personB);
    }),

    [IPC_CHANNELS.SEARCH_QUERY]: wrap(({ q, entityTypes, limit } = {}) =>
      search.search({ q, entityTypes, limit }),
    ),
    [IPC_CHANNELS.SEARCH_DUPLICATES]: wrap(({ limit } = {}) =>
      search.potentialDuplicates({ limit }),
    ),

    [IPC_CHANNELS.GEDCOM_PREVIEW]: wrap(({ gedcom: input }) => gedcom.preview(input)),
    [IPC_CHANNELS.GEDCOM_IMPORT]: wrap(({ gedcom: input, performedBy }) =>
      gedcom.import(input, { performedBy: actorOf(performedBy) }),
    ),
    [IPC_CHANNELS.GEDCOM_EXPORT]: wrap(({ format, personIds, ancestorsOf, descendantsOf } = {}) =>
      gedcom.export({ format, personIds, ancestorsOf, descendantsOf }),
    ),
  };
}
