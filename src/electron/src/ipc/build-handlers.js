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
// Écritures regroupées en une action annulable (Ctrl+Z), sauf domaines
// techniques : comptes, sauvegardes, arbres, IA, historique lui-même.
const WRITE_ACTIONS =
  /^(create|update|remove|restore|merge|import|addParticipant|addCitation|upload|purge)$/;
const NON_UNDOABLE_DOMAINS = new Set(['accounts', 'backups', 'trees', 'ai', 'history']);
const DOMAIN_LABELS = {
  persons: 'personne',
  places: 'lieu',
  events: 'événement',
  unions: 'union',
  parentages: 'lien de parenté',
  sources: 'source',
  media: 'média',
  notes: 'note',
  research: 'carnet de recherche',
  gedcom: 'fichier GEDCOM',
  search: 'fusion de doublons',
  trash: 'corbeille',
};
const ACTION_LABELS = {
  create: 'Ajout',
  update: 'Modification',
  remove: 'Suppression',
  restore: 'Restauration',
  merge: 'Fusion',
  import: 'Import',
  addParticipant: 'Ajout de participant',
  addCitation: 'Ajout de citation',
  upload: 'Ajout',
  purge: 'Suppression définitive',
  add: 'Ajout',
};

function withUndoGroup(services, channel, handler) {
  const [, domain, action] = channel.split(':');
  if (NON_UNDOABLE_DOMAINS.has(domain) || !WRITE_ACTIONS.test(action ?? '')) return handler;
  const verb =
    ACTION_LABELS[action] ??
    ACTION_LABELS[action.match(/^(add|update|remove)/)?.[1]] ??
    'Modification';
  return async (payload) => {
    const history = services.history;
    const groupId = history?.begin(
      `${verb} · ${DOMAIN_LABELS[domain] ?? domain}`,
      payload?.performedBy ?? null,
    );
    try {
      return await handler(payload);
    } finally {
      history?.end(groupId);
    }
  };
}

export function buildIpcHandlers(services, workspace = null, storage = null) {
  const handlers = buildRawHandlers(services, workspace, storage);
  return Object.fromEntries(
    Object.entries(handlers).map(([channel, handler]) => [
      channel,
      withUndoGroup(services, channel, handler),
    ]),
  );
}

function buildRawHandlers(services, workspace, storage) {
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
    [IPC_CHANNELS.GRAPH_COMMON_ANCESTORS]: wrap(({ personA, personB }) => {
      graph.assertPair(personA, personB);
      return graph.findCommonAncestors(personA, personB);
    }),
    [IPC_CHANNELS.GRAPH_CYCLES]: wrap(() => graph.detectCycles()),
    [IPC_CHANNELS.GRAPH_TIMELINE]: wrap(() => graph.validateTimeline()),

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
      gedcom.importSafely(input, { performedBy: actorOf(performedBy) }),
    ),
    [IPC_CHANNELS.GEDCOM_EXPORT]: wrap(
      ({ format, personIds, personOnly, ancestorsOf, descendantsOf, branchOf, side } = {}) =>
        gedcom.export({
          format,
          personIds,
          personOnly,
          ancestorsOf,
          descendantsOf,
          branchOf,
          side,
        }),
    ),
    [IPC_CHANNELS.GEDCOM_EXPORT_ARCHIVE]: wrap(
      ({ personIds, personOnly, ancestorsOf, descendantsOf, branchOf, side } = {}) =>
        gedcom.exportArchive({ personIds, personOnly, ancestorsOf, descendantsOf, branchOf, side }),
    ),
    [IPC_CHANNELS.GEDCOM_IMPORT_ARCHIVE]: wrap(({ contentBase64, performedBy }) =>
      gedcom.importArchive(contentBase64, { performedBy: actorOf(performedBy) }),
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
    [IPC_CHANNELS.ACCOUNTS_REMOVE]: wrap(({ id, token, performedBy }) => {
      accounts.requireSession(token);
      accounts.remove(id, { performedBy: actorOf(performedBy) });
      return { removed: true };
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

    [IPC_CHANNELS.BACKUPS_EXPORT_ENCRYPTED]: wrap(({ filename, passphrase, token }) => {
      accounts.requireSession(token);
      return backups.exportEncrypted(filename, passphrase);
    }),
    [IPC_CHANNELS.BACKUPS_IMPORT_ENCRYPTED]: wrap(({ contentBase64, passphrase, token }) => {
      accounts.requireSession(token);
      return backups.importEncrypted(contentBase64, passphrase);
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
    [IPC_CHANNELS.RESEARCH_GET]: wrap(({ id }) => research.get(id)),
    [IPC_CHANNELS.RESEARCH_UPDATE]: wrap(({ id, data, performedBy }) =>
      research.update(id, data, { performedBy: actorOf(performedBy) }),
    ),
    [IPC_CHANNELS.RESEARCH_REMOVE]: wrap(({ id, performedBy }) => {
      research.remove(id, { performedBy: actorOf(performedBy) });
      return { removed: true };
    }),
    [IPC_CHANNELS.RESEARCH_ADD_HYPOTHESIS]: wrap(({ researchId, data, performedBy }) =>
      research.addHypothesis(researchId, data, { performedBy: actorOf(performedBy) }),
    ),
    [IPC_CHANNELS.RESEARCH_UPDATE_HYPOTHESIS]: wrap(({ id, data, performedBy }) =>
      research.updateHypothesis(id, data, { performedBy: actorOf(performedBy) }),
    ),
    [IPC_CHANNELS.RESEARCH_REMOVE_HYPOTHESIS]: wrap(({ id, performedBy }) => {
      research.removeHypothesis(id, { performedBy: actorOf(performedBy) });
      return { removed: true };
    }),
    [IPC_CHANNELS.RESEARCH_ADD_EVIDENCE]: wrap(({ hypothesisId, data, performedBy }) =>
      research.addEvidence(hypothesisId, data, { performedBy: actorOf(performedBy) }),
    ),
    [IPC_CHANNELS.RESEARCH_REMOVE_EVIDENCE]: wrap(({ id, performedBy }) => {
      research.removeEvidence(id, { performedBy: actorOf(performedBy) });
      return { removed: true };
    }),
    [IPC_CHANNELS.RESEARCH_ADD_TASK]: wrap(({ researchId, data, performedBy }) =>
      research.addTask(researchId, data, { performedBy: actorOf(performedBy) }),
    ),
    [IPC_CHANNELS.RESEARCH_UPDATE_TASK]: wrap(({ id, data, performedBy }) =>
      research.updateTask(id, data, { performedBy: actorOf(performedBy) }),
    ),
    [IPC_CHANNELS.RESEARCH_REMOVE_TASK]: wrap(({ id, performedBy }) => {
      research.removeTask(id, { performedBy: actorOf(performedBy) });
      return { removed: true };
    }),

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
    [IPC_CHANNELS.MEDIA_LIST_FOR_SOURCE]: wrap(({ sourceId }) => media.listForSource(sourceId)),
    [IPC_CHANNELS.MEDIA_PHOTO_GET]: wrap(({ id }) => services.photos.get(id)),
    [IPC_CHANNELS.MEDIA_PHOTO_UPDATE]: wrap(({ id, data, performedBy }) =>
      services.photos.updateMetadata(id, data, { performedBy: actorOf(performedBy) }),
    ),
    [IPC_CHANNELS.MEDIA_REGION_ADD]: wrap(({ id, data, performedBy }) =>
      services.photos.addRegion(id, data, { performedBy: actorOf(performedBy) }),
    ),
    [IPC_CHANNELS.MEDIA_REGION_REMOVE]: wrap(({ regionId, performedBy }) => {
      services.photos.removeRegion(regionId, { performedBy: actorOf(performedBy) });
      return { removed: true };
    }),
    [IPC_CHANNELS.MEDIA_PHOTOS_FOR_PERSON]: wrap(({ personId }) =>
      services.photos.listForPerson(personId),
    ),
    [IPC_CHANNELS.MEDIA_REMOVE]: wrap(({ id, performedBy }) => {
      media.remove(id, { performedBy: actorOf(performedBy) });
      return { removed: true };
    }),

    [IPC_CHANNELS.GRAPH_NETWORK]: wrap(({ personId, depth }) =>
      services.graph.getNetwork(Number(personId), { depth: depth ? Number(depth) : 2 }),
    ),
    [IPC_CHANNELS.PERSON_QUALITY]: wrap(({ personId }) => services.quality.forPerson(personId)),
    [IPC_CHANNELS.SEARCH_ADVANCED]: wrap(({ filters }) =>
      services.advancedSearch.search(filters ?? {}),
    ),
    [IPC_CHANNELS.HISTORY_STATUS]: wrap(({ limit }) => ({
      ...services.history.status(),
      actions: services.history.list(Math.min(Math.max(Number(limit) || 50, 1), 200)),
    })),
    [IPC_CHANNELS.HISTORY_UNDO]: wrap(() => services.history.undo()),
    [IPC_CHANNELS.HISTORY_REDO]: wrap(() => services.history.redo()),

    ...(storage
      ? {
          [IPC_CHANNELS.STORAGE_STATUS]: wrap(() => storage.status()),
          [IPC_CHANNELS.STORAGE_SET_MIRROR]: wrap(({ mirrorDir, token }) => {
            services.accounts.requireSession(token);
            return storage.setMirrorDir(mirrorDir ?? null);
          }),
          [IPC_CHANNELS.STORAGE_SET_DATA_DIR]: wrap(({ dataDir, token }) => {
            services.accounts.requireSession(token);
            return storage.setDataDir(dataDir ?? null);
          }),
        }
      : {}),

    ...(workspace
      ? {
          [IPC_CHANNELS.TREES_LIST]: wrap(() => workspace.list()),
          [IPC_CHANNELS.TREES_ACTIVE]: wrap(() => workspace.active()),
          [IPC_CHANNELS.TREES_LIST_DELETED]: wrap(() => workspace.listDeleted()),
          [IPC_CHANNELS.TREES_CREATE]: wrap(({ data }) => workspace.create(data ?? {})),
          [IPC_CHANNELS.TREES_UPDATE]: wrap(({ id, data }) => workspace.update(id, data ?? {})),
          [IPC_CHANNELS.TREES_ACTIVATE]: wrap(({ id }) => workspace.activate(id)),
          [IPC_CHANNELS.TREES_REMOVE]: wrap(({ id }) => workspace.remove(id)),
          [IPC_CHANNELS.TREES_RESTORE]: wrap(({ id }) => workspace.restore(id)),
        }
      : {}),
  };
}
