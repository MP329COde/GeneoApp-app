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
  const {
    persons,
    places,
    events,
    unions,
    parentages,
    sources,
    audit,
    graph,
    search,
    gedcom,
    accounts,
    backups,
    trash,
    research,
    statistics,
    localAi,
    notes,
    media,
    merge,
  } = services;

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
    [IPC_CHANNELS.EVENTS_LIST_ALL]: wrap(() => events.listAll()),
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
    [IPC_CHANNELS.SEARCH_MERGE]: wrap(({ survivorId, duplicateId, performedBy }) =>
      merge.mergePersons(survivorId, duplicateId, { performedBy: actorOf(performedBy) }),
    ),
    [IPC_CHANNELS.SEARCH_MERGE_PREVIEW]: wrap(({ survivorId, duplicateId }) =>
      merge.previewPersons(survivorId, duplicateId),
    ),

    [IPC_CHANNELS.GEDCOM_PREVIEW]: wrap(({ gedcom: input }) => gedcom.preview(input)),
    [IPC_CHANNELS.GEDCOM_IMPORT]: wrap(({ gedcom: input, performedBy }) =>
      gedcom.import(input, { performedBy: actorOf(performedBy) }),
    ),
    [IPC_CHANNELS.GEDCOM_EXPORT]: wrap(({ format, personIds, ancestorsOf, descendantsOf } = {}) =>
      gedcom.export({ format, personIds, ancestorsOf, descendantsOf }),
    ),

    [IPC_CHANNELS.ACCOUNTS_CREATE]: wrap(({ data, performedBy }) =>
      accounts.create(data, { performedBy: actorOf(performedBy) }),
    ),
    [IPC_CHANNELS.ACCOUNTS_LIST]: wrap(() => accounts.list()),
    [IPC_CHANNELS.ACCOUNTS_LOGIN]: wrap(({ name, pin }) => accounts.login({ name, pin })),
    [IPC_CHANNELS.ACCOUNTS_LOGOUT]: wrap(({ token }) => {
      accounts.logout(token);
      return { loggedOut: true };
    }),

    // Les opérations sensibles (sauvegarde/restauration, purge de corbeille)
    // exigent un jeton de session valide dans le payload, comme côté HTTP
    // (en-tête x-geneoapp-session) : requireSession lève si absent/expiré.
    [IPC_CHANNELS.BACKUPS_CREATE]: wrap(({ data, token, performedBy }) => {
      accounts.requireSession(token);
      return backups.create(data, { performedBy: actorOf(performedBy) });
    }),
    [IPC_CHANNELS.BACKUPS_LIST]: wrap(({ token }) => {
      accounts.requireSession(token);
      return backups.list();
    }),
    [IPC_CHANNELS.BACKUPS_VERIFY]: wrap(({ filename, token }) => {
      accounts.requireSession(token);
      return backups.verify(filename);
    }),
    [IPC_CHANNELS.BACKUPS_RESTORE]: wrap(({ filename, kind, token, performedBy }) => {
      accounts.requireSession(token);
      return kind === 'sqlite'
        ? backups.restoreFile(filename)
        : backups.restoreLogical(filename, { performedBy: actorOf(performedBy) });
    }),

    [IPC_CHANNELS.TRASH_LIST]: wrap(() => trash.list()),
    [IPC_CHANNELS.TRASH_RESTORE]: wrap(({ table, id, token, performedBy }) => {
      accounts.requireSession(token);
      return trash.restore(table, id, { performedBy: actorOf(performedBy) });
    }),
    [IPC_CHANNELS.TRASH_PURGE]: wrap(({ table, id, token, performedBy }) => {
      accounts.requireSession(token);
      trash.purge(table, id, { performedBy: actorOf(performedBy) });
      return { purged: true };
    }),

    [IPC_CHANNELS.RESEARCH_CREATE]: wrap(({ data, performedBy }) =>
      research.create(data, { performedBy: actorOf(performedBy) }),
    ),
    [IPC_CHANNELS.RESEARCH_LIST]: wrap(() => research.list()),

    [IPC_CHANNELS.STATISTICS_TOTALS]: wrap(() => ({
      totals: statistics.totals(),
      generatedAt: new Date().toISOString(),
    })),

    [IPC_CHANNELS.AI_ANALYZE]: wrap((data) => localAi.analyze(data)),

    [IPC_CHANNELS.NOTES_CREATE]: wrap(({ data, performedBy }) =>
      notes.create(data, { performedBy: actorOf(performedBy) }),
    ),
    [IPC_CHANNELS.NOTES_LIST_FOR_ENTITY]: wrap(({ entityType, entityId }) =>
      notes.listForEntity(entityType, entityId),
    ),
    [IPC_CHANNELS.NOTES_GET]: wrap(({ id }) => notes.get(id)),

    [IPC_CHANNELS.MEDIA_UPLOAD]: wrap(({ data, performedBy }) =>
      media.upload(data, { performedBy: actorOf(performedBy) }),
    ),
    [IPC_CHANNELS.MEDIA_GET]: wrap(({ id }) => media.get(id)),
    [IPC_CHANNELS.MEDIA_DOWNLOAD]: wrap(async ({ id }) => {
      const { media: record, content } = await media.download(id);
      return {
        filename: record.original_filename,
        mimeType: record.mime_type,
        contentBase64: content.toString('base64'),
      };
    }),
    [IPC_CHANNELS.MEDIA_LIST_FOR_ENTITY]: wrap(({ entityType, entityId }) =>
      media.listForEntity(entityType, entityId),
    ),
    [IPC_CHANNELS.MEDIA_REMOVE]: wrap(({ id, performedBy }) => {
      media.remove(id, { performedBy: actorOf(performedBy) });
      return { removed: true };
    }),
  };
}
