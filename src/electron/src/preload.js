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
  },

  search: {
    query: (q, entityTypes) => invoke(IPC_CHANNELS.SEARCH_QUERY, { q, entityTypes }),
    duplicates: (limit) => invoke(IPC_CHANNELS.SEARCH_DUPLICATES, { limit }),
  },
};

contextBridge.exposeInMainWorld('geneoapp', api);
