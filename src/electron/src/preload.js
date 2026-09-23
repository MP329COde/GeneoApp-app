import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from './ipc/channels.js';

/**
 * Invoque un canal de l'allowlist et déballe l'enveloppe { ok, data|error }
 * en une promesse résolue/rejetée classique côté renderer, pour que l'API
 * exposée se comporte comme un client HTTP standard.
 */
async function invoke(channel, payload) {
  const response = await ipcRenderer.invoke(channel, payload);
  if (!response?.ok) {
    const error = new Error(response?.error?.message ?? 'Erreur IPC inconnue');
    error.status = response?.error?.status;
    error.fields = response?.error?.fields;
    throw error;
  }
  return response.data;
}

const api = {
  persons: {
    create: (data, performedBy) => invoke(IPC_CHANNELS.PERSONS_CREATE, { data, performedBy }),
    get: (id) => invoke(IPC_CHANNELS.PERSONS_GET, { id }),
    list: (includeDeleted = false) => invoke(IPC_CHANNELS.PERSONS_LIST, { includeDeleted }),
    update: (id, data, performedBy) =>
      invoke(IPC_CHANNELS.PERSONS_UPDATE, { id, data, performedBy }),
    remove: (id, performedBy) => invoke(IPC_CHANNELS.PERSONS_REMOVE, { id, performedBy }),
    restore: (id, performedBy) => invoke(IPC_CHANNELS.PERSONS_RESTORE, { id, performedBy }),
  },

  places: {
    create: (data, performedBy) => invoke(IPC_CHANNELS.PLACES_CREATE, { data, performedBy }),
    get: (id) => invoke(IPC_CHANNELS.PLACES_GET, { id }),
    list: (includeDeleted = false) => invoke(IPC_CHANNELS.PLACES_LIST, { includeDeleted }),
    remove: (id, performedBy) => invoke(IPC_CHANNELS.PLACES_REMOVE, { id, performedBy }),
  },

  events: {
    create: (data, performedBy) => invoke(IPC_CHANNELS.EVENTS_CREATE, { data, performedBy }),
    get: (id) => invoke(IPC_CHANNELS.EVENTS_GET, { id }),
    listAll: () => invoke(IPC_CHANNELS.EVENTS_LIST_ALL),
    listForPerson: (personId) => invoke(IPC_CHANNELS.EVENTS_LIST_FOR_PERSON, { personId }),
    addParticipant: (id, data, performedBy) =>
      invoke(IPC_CHANNELS.EVENTS_ADD_PARTICIPANT, { id, data, performedBy }),
    remove: (id, performedBy) => invoke(IPC_CHANNELS.EVENTS_REMOVE, { id, performedBy }),
  },

  unions: {
    create: (data, performedBy) => invoke(IPC_CHANNELS.UNIONS_CREATE, { data, performedBy }),
    get: (id) => invoke(IPC_CHANNELS.UNIONS_GET, { id }),
    listForPerson: (personId) => invoke(IPC_CHANNELS.UNIONS_LIST_FOR_PERSON, { personId }),
    remove: (id, performedBy) => invoke(IPC_CHANNELS.UNIONS_REMOVE, { id, performedBy }),
  },

  parentages: {
    create: (data, performedBy) => invoke(IPC_CHANNELS.PARENTAGES_CREATE, { data, performedBy }),
    get: (id) => invoke(IPC_CHANNELS.PARENTAGES_GET, { id }),
    listParentsOf: (personId) => invoke(IPC_CHANNELS.PARENTAGES_LIST_PARENTS_OF, { personId }),
    listChildrenOf: (personId) => invoke(IPC_CHANNELS.PARENTAGES_LIST_CHILDREN_OF, { personId }),
    remove: (id, performedBy) => invoke(IPC_CHANNELS.PARENTAGES_REMOVE, { id, performedBy }),
  },

  sources: {
    create: (data, performedBy) => invoke(IPC_CHANNELS.SOURCES_CREATE, { data, performedBy }),
    get: (id) => invoke(IPC_CHANNELS.SOURCES_GET, { id }),
    addCitation: (data, performedBy) =>
      invoke(IPC_CHANNELS.SOURCES_ADD_CITATION, { data, performedBy }),
    listCitationsForEntity: (entityType, entityId) =>
      invoke(IPC_CHANNELS.SOURCES_LIST_CITATIONS_FOR_ENTITY, { entityType, entityId }),
  },

  audit: {
    listForEntity: (tableName, rowId) =>
      invoke(IPC_CHANNELS.AUDIT_LIST_FOR_ENTITY, { tableName, rowId }),
  },

  graph: {
    ancestors: (personId, depth) => invoke(IPC_CHANNELS.GRAPH_ANCESTORS, { personId, depth }),
    descendants: (personId, depth) => invoke(IPC_CHANNELS.GRAPH_DESCENDANTS, { personId, depth }),
    relations: (personId) => invoke(IPC_CHANNELS.GRAPH_RELATIONS, { personId }),
    relationship: (personA, personB) =>
      invoke(IPC_CHANNELS.GRAPH_RELATIONSHIP, { personA, personB }),
    commonAncestors: (personA, personB) =>
      invoke(IPC_CHANNELS.GRAPH_COMMON_ANCESTORS, { personA, personB }),
    cycles: () => invoke(IPC_CHANNELS.GRAPH_CYCLES),
    timeline: () => invoke(IPC_CHANNELS.GRAPH_TIMELINE),
  },

  search: {
    query: (q, entityTypes) => invoke(IPC_CHANNELS.SEARCH_QUERY, { q, entityTypes }),
    duplicates: (limit) => invoke(IPC_CHANNELS.SEARCH_DUPLICATES, { limit }),
    merge: (survivorId, duplicateId, performedBy) =>
      invoke(IPC_CHANNELS.SEARCH_MERGE, { survivorId, duplicateId, performedBy }),
    previewMerge: (survivorId, duplicateId) =>
      invoke(IPC_CHANNELS.SEARCH_MERGE_PREVIEW, { survivorId, duplicateId }),
  },

  gedcom: {
    preview: (gedcom) => invoke(IPC_CHANNELS.GEDCOM_PREVIEW, { gedcom }),
    import: (gedcom, performedBy) => invoke(IPC_CHANNELS.GEDCOM_IMPORT, { gedcom, performedBy }),
    export: (options) => invoke(IPC_CHANNELS.GEDCOM_EXPORT, options),
  },

  accounts: {
    create: (data, performedBy) => invoke(IPC_CHANNELS.ACCOUNTS_CREATE, { data, performedBy }),
    list: () => invoke(IPC_CHANNELS.ACCOUNTS_LIST),
    login: (name, pin) => invoke(IPC_CHANNELS.ACCOUNTS_LOGIN, { name, pin }),
    logout: (token) => invoke(IPC_CHANNELS.ACCOUNTS_LOGOUT, { token }),
    remove: (id, token, performedBy) =>
      invoke(IPC_CHANNELS.ACCOUNTS_REMOVE, { id, token, performedBy }),
  },

  backups: {
    create: (data, token, performedBy) =>
      invoke(IPC_CHANNELS.BACKUPS_CREATE, { data, token, performedBy }),
    list: (token) => invoke(IPC_CHANNELS.BACKUPS_LIST, { token }),
    verify: (filename, token) => invoke(IPC_CHANNELS.BACKUPS_VERIFY, { filename, token }),
    restore: (filename, kind, token, performedBy) =>
      invoke(IPC_CHANNELS.BACKUPS_RESTORE, { filename, kind, token, performedBy }),
  },

  trash: {
    list: () => invoke(IPC_CHANNELS.TRASH_LIST),
    restore: (table, id, token, performedBy) =>
      invoke(IPC_CHANNELS.TRASH_RESTORE, { table, id, token, performedBy }),
    purge: (table, id, token, performedBy) =>
      invoke(IPC_CHANNELS.TRASH_PURGE, { table, id, token, performedBy }),
  },

  research: {
    create: (data, performedBy) => invoke(IPC_CHANNELS.RESEARCH_CREATE, { data, performedBy }),
    list: () => invoke(IPC_CHANNELS.RESEARCH_LIST),
  },

  statistics: {
    totals: () => invoke(IPC_CHANNELS.STATISTICS_TOTALS),
  },

  ai: {
    analyze: (prompt) => invoke(IPC_CHANNELS.AI_ANALYZE, { prompt }),
  },

  notes: {
    create: (data, performedBy) => invoke(IPC_CHANNELS.NOTES_CREATE, { data, performedBy }),
    listForEntity: (entityType, entityId) =>
      invoke(IPC_CHANNELS.NOTES_LIST_FOR_ENTITY, { entityType, entityId }),
    get: (id) => invoke(IPC_CHANNELS.NOTES_GET, { id }),
  },

  media: {
    upload: (data, performedBy) => invoke(IPC_CHANNELS.MEDIA_UPLOAD, { data, performedBy }),
    get: (id) => invoke(IPC_CHANNELS.MEDIA_GET, { id }),
    download: (id) => invoke(IPC_CHANNELS.MEDIA_DOWNLOAD, { id }),
    listForEntity: (entityType, entityId) =>
      invoke(IPC_CHANNELS.MEDIA_LIST_FOR_ENTITY, { entityType, entityId }),
    listForSource: (sourceId) => invoke(IPC_CHANNELS.MEDIA_LIST_FOR_SOURCE, { sourceId }),
    remove: (id, performedBy) => invoke(IPC_CHANNELS.MEDIA_REMOVE, { id, performedBy }),
  },

  history: {
    status: (limit) => invoke(IPC_CHANNELS.HISTORY_STATUS, { limit }),
    undo: () => invoke(IPC_CHANNELS.HISTORY_UNDO),
    redo: () => invoke(IPC_CHANNELS.HISTORY_REDO),
  },

  trees: {
    list: () => invoke(IPC_CHANNELS.TREES_LIST),
    active: () => invoke(IPC_CHANNELS.TREES_ACTIVE),
    listDeleted: () => invoke(IPC_CHANNELS.TREES_LIST_DELETED),
    create: (data) => invoke(IPC_CHANNELS.TREES_CREATE, { data }),
    update: (id, data) => invoke(IPC_CHANNELS.TREES_UPDATE, { id, data }),
    activate: (id) => invoke(IPC_CHANNELS.TREES_ACTIVATE, { id }),
    remove: (id) => invoke(IPC_CHANNELS.TREES_REMOVE, { id }),
    restore: (id) => invoke(IPC_CHANNELS.TREES_RESTORE, { id }),
  },
};

contextBridge.exposeInMainWorld('geneoapp', api);
