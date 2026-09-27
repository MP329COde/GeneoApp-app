// CommonJS (extension .cjs) volontairement, malgré "type": "module" dans
// package.json : un script preload sandboxé (webPreferences.sandbox: true)
// ne peut pas utiliser `import` (Electron le charge dans un contexte qui ne
// supporte pas les modules ES) — avec `import`, le preload échouait
// silencieusement au lancement réel de l'app ("Cannot use import statement
// outside a module" dans les DevTools), laissant `window.geneoapp` undefined
// et donc une page blanche (aucun pont IPC).
//
// IPC_CHANNELS est recopié ici (et non `require('./ipc/channels.js')`) pour
// la même raison : le `require()` polyfillé d'un preload sandboxé ne
// résout QUE les modules Electron/Node intégrés, jamais un fichier local
// ("Error: module not found"). Un test dédié
// (test/electron/preload-channels-sync.test.js) échoue si cette copie
// diverge de src/electron/src/ipc/channels.js (source de vérité). Voir
// docs/adr/0013-preload-cjs-sandbox.md.
const { contextBridge, ipcRenderer } = require('electron');
const IPC_CHANNELS = Object.freeze({

  PERSONS_CREATE: 'geneoapp:persons:create',
  PERSONS_GET: 'geneoapp:persons:get',
  PERSONS_LIST: 'geneoapp:persons:list',
  PERSONS_UPDATE: 'geneoapp:persons:update',
  PERSONS_REMOVE: 'geneoapp:persons:remove',
  PERSONS_RESTORE: 'geneoapp:persons:restore',

  PLACES_CREATE: 'geneoapp:places:create',
  PLACES_GET: 'geneoapp:places:get',
  PLACES_LIST: 'geneoapp:places:list',
  PLACES_REMOVE: 'geneoapp:places:remove',
  PLACES_AUTO_LOCATE_PREVIEW: 'geneoapp:places:autoLocatePreview',
  PLACES_AUTO_LOCATE_APPLY: 'geneoapp:places:autoLocateApply',

  EVENTS_CREATE: 'geneoapp:events:create',
  EVENTS_GET: 'geneoapp:events:get',
  EVENTS_LIST_ALL: 'geneoapp:events:listAll',
  EVENTS_LIST_FOR_PERSON: 'geneoapp:events:listForPerson',
  EVENTS_ADD_PARTICIPANT: 'geneoapp:events:addParticipant',
  EVENTS_REMOVE: 'geneoapp:events:remove',

  UNIONS_CREATE: 'geneoapp:unions:create',
  UNIONS_GET: 'geneoapp:unions:get',
  UNIONS_LIST_FOR_PERSON: 'geneoapp:unions:listForPerson',
  UNIONS_REMOVE: 'geneoapp:unions:remove',

  PARENTAGES_CREATE: 'geneoapp:parentages:create',
  PARENTAGES_GET: 'geneoapp:parentages:get',
  PARENTAGES_LIST_PARENTS_OF: 'geneoapp:parentages:listParentsOf',
  PARENTAGES_LIST_CHILDREN_OF: 'geneoapp:parentages:listChildrenOf',
  PARENTAGES_REMOVE: 'geneoapp:parentages:remove',

  SOURCES_CREATE: 'geneoapp:sources:create',
  SOURCES_GET: 'geneoapp:sources:get',
  SOURCES_ADD_CITATION: 'geneoapp:sources:addCitation',
  SOURCES_LIST_CITATIONS_FOR_ENTITY: 'geneoapp:sources:listCitationsForEntity',

  AUDIT_LIST_FOR_ENTITY: 'geneoapp:audit:listForEntity',

  NOTIFICATIONS_LIST: 'geneoapp:notifications:list',
  NOTIFICATIONS_READ: 'geneoapp:notifications:read',
  NOTIFICATIONS_READ_ALL: 'geneoapp:notifications:readAll',
  NOTIFICATIONS_PUBLISH: 'geneoapp:notifications:publish',

  GRAPH_ANCESTORS: 'geneoapp:graph:ancestors',
  GRAPH_DESCENDANTS: 'geneoapp:graph:descendants',
  GRAPH_RELATIONS: 'geneoapp:graph:relations',
  GRAPH_RELATIONSHIP: 'geneoapp:graph:relationship',
  GRAPH_COMMON_ANCESTORS: 'geneoapp:graph:commonAncestors',
  GRAPH_CYCLES: 'geneoapp:graph:cycles',
  GRAPH_TIMELINE: 'geneoapp:graph:timeline',

  SEARCH_QUERY: 'geneoapp:search:query',
  SEARCH_DUPLICATES: 'geneoapp:search:duplicates',
  SEARCH_MERGE: 'geneoapp:search:merge',
  SEARCH_MERGE_PREVIEW: 'geneoapp:search:mergePreview',

  GEDCOM_PREVIEW: 'geneoapp:gedcom:preview',
  GEDCOM_IMPORT: 'geneoapp:gedcom:import',
  GEDCOM_EXPORT: 'geneoapp:gedcom:export',
  GEDCOM_EXPORT_ARCHIVE: 'geneoapp:gedcom:exportArchive',
  GEDCOM_IMPORT_ARCHIVE: 'geneoapp:gedcom:importArchive',

  ACCOUNTS_CREATE: 'geneoapp:accounts:create',
  ACCOUNTS_LIST: 'geneoapp:accounts:list',
  ACCOUNTS_LOGIN: 'geneoapp:accounts:login',
  ACCOUNTS_LOGOUT: 'geneoapp:accounts:logout',
  ACCOUNTS_REMOVE: 'geneoapp:accounts:remove',

  BACKUPS_CREATE: 'geneoapp:backups:create',
  BACKUPS_LIST: 'geneoapp:backups:list',
  BACKUPS_VERIFY: 'geneoapp:backups:verify',
  BACKUPS_RESTORE: 'geneoapp:backups:restore',
  BACKUPS_EXPORT_ENCRYPTED: 'geneoapp:backups:exportEncrypted',
  BACKUPS_IMPORT_ENCRYPTED: 'geneoapp:backups:importEncrypted',

  TRASH_LIST: 'geneoapp:trash:list',
  TRASH_RESTORE: 'geneoapp:trash:restore',
  TRASH_PURGE: 'geneoapp:trash:purge',

  RESEARCH_CREATE: 'geneoapp:research:create',
  RESEARCH_LIST: 'geneoapp:research:list',
  RESEARCH_GET: 'geneoapp:research:get',
  RESEARCH_UPDATE: 'geneoapp:research:update',
  RESEARCH_REMOVE: 'geneoapp:research:remove',
  RESEARCH_ADD_HYPOTHESIS: 'geneoapp:research:addHypothesis',
  RESEARCH_UPDATE_HYPOTHESIS: 'geneoapp:research:updateHypothesis',
  RESEARCH_REMOVE_HYPOTHESIS: 'geneoapp:research:removeHypothesis',
  RESEARCH_ADD_EVIDENCE: 'geneoapp:research:addEvidence',
  RESEARCH_REMOVE_EVIDENCE: 'geneoapp:research:removeEvidence',
  RESEARCH_ADD_TASK: 'geneoapp:research:addTask',
  RESEARCH_UPDATE_TASK: 'geneoapp:research:updateTask',
  RESEARCH_REMOVE_TASK: 'geneoapp:research:removeTask',

  STATISTICS_TOTALS: 'geneoapp:statistics:totals',

  AI_ANALYZE: 'geneoapp:ai:analyze',

  NOTES_CREATE: 'geneoapp:notes:create',
  NOTES_LIST_FOR_ENTITY: 'geneoapp:notes:listForEntity',
  NOTES_GET: 'geneoapp:notes:get',
  NOTES_LIST_ALL: 'geneoapp:notes:listAll',
  NOTES_UPDATE: 'geneoapp:notes:update',
  NOTES_REMOVE: 'geneoapp:notes:remove',

  MEDIA_UPLOAD: 'geneoapp:media:upload',
  MEDIA_GET: 'geneoapp:media:get',
  MEDIA_DOWNLOAD: 'geneoapp:media:download',
  MEDIA_LIST_FOR_ENTITY: 'geneoapp:media:listForEntity',
  MEDIA_LIST_FOR_SOURCE: 'geneoapp:media:listForSource',
  MEDIA_REMOVE: 'geneoapp:media:remove',
  MEDIA_PHOTO_GET: 'geneoapp:media:photo',
  MEDIA_PHOTO_UPDATE: 'geneoapp:media:updatePhoto',
  MEDIA_REGION_ADD: 'geneoapp:media:addRegion',
  MEDIA_REGION_REMOVE: 'geneoapp:media:removeRegion',
  MEDIA_PHOTOS_FOR_PERSON: 'geneoapp:media:photosForPerson',
  MEDIA_DECODE: 'geneoapp:media:decode',
  MEDIA_TRANSCRIPTION_SAVE: 'geneoapp:media:saveTranscription',
  MEDIA_OWNERS: 'geneoapp:media:owners',
  MEDIA_LINK: 'geneoapp:media:link',
  MEDIA_IDENTIFY: 'geneoapp:media:identify',
  PERSONS_SET_PORTRAIT: 'geneoapp:persons:setPortrait',
  PERSONS_UPLOAD_PORTRAIT: 'geneoapp:persons:uploadPortrait',

  SEARCH_ADVANCED: 'geneoapp:search:advanced',
  PERSON_QUALITY: 'geneoapp:quality:forPerson',
  GRAPH_NETWORK: 'geneoapp:graph:network',
  INDEXING_STATUS: 'geneoapp:indexing:status',
  INDEXING_SEARCH: 'geneoapp:indexing:search',
  INDEXING_ADD_SOURCE: 'geneoapp:indexing:addSource',
  INDEXING_SET_SOURCE: 'geneoapp:indexing:setSource',
  INDEXING_REMOVE_SOURCE: 'geneoapp:indexing:removeSource',
  INDEXING_SETTINGS: 'geneoapp:indexing:settings',
  INDEXING_RUN: 'geneoapp:indexing:run',
  INDEXING_SEARCH_PAGE: 'geneoapp:indexing:searchPage',
  INDEXING_DOCUMENT: 'geneoapp:indexing:document',
  INDEXING_UPDATE_SOURCE: 'geneoapp:indexing:updateSource',
  INDEXING_RUN_SOURCE: 'geneoapp:indexing:runSource',
  INDEXING_CLEAR_SOURCE: 'geneoapp:indexing:clearSource',
  INDEXING_CANCEL: 'geneoapp:indexing:cancel',
  HISTORY_STATUS: 'geneoapp:history:status',
  HISTORY_UNDO: 'geneoapp:history:undo',
  HISTORY_REDO: 'geneoapp:history:redo',

  STORAGE_STATUS: 'geneoapp:storage:status',
  STORAGE_SET_MIRROR: 'geneoapp:storage:setMirror',
  STORAGE_SET_DATA_DIR: 'geneoapp:storage:setDataDir',

  TREES_LIST: 'geneoapp:trees:list',
  TREES_ACTIVE: 'geneoapp:trees:active',
  TREES_LIST_DELETED: 'geneoapp:trees:listDeleted',
  TREES_CREATE: 'geneoapp:trees:create',
  TREES_UPDATE: 'geneoapp:trees:update',
  TREES_ACTIVATE: 'geneoapp:trees:activate',
  TREES_REMOVE: 'geneoapp:trees:remove',
  TREES_RESTORE: 'geneoapp:trees:restore',
});

// Jeton du serveur HTTP local embarqué (voir main.js/local-http-guard.js),
// transmis uniquement via additionalArguments (jamais par le réseau).
function readHttpToken() {
  const arg = process.argv.find((value) => value.startsWith('--geneoapp-http-token='));
  return arg ? arg.slice('--geneoapp-http-token='.length) : null;
}
const httpToken = readHttpToken();

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
    previewAutoLocate: () => invoke(IPC_CHANNELS.PLACES_AUTO_LOCATE_PREVIEW),
    applyAutoLocate: (assignments) =>
      invoke(IPC_CHANNELS.PLACES_AUTO_LOCATE_APPLY, { assignments }),
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

  notifications: {
    list: (options) => invoke(IPC_CHANNELS.NOTIFICATIONS_LIST, options),
    markRead: (id) => invoke(IPC_CHANNELS.NOTIFICATIONS_READ, { id }),
    markAllRead: () => invoke(IPC_CHANNELS.NOTIFICATIONS_READ_ALL),
    publish: (items) => invoke(IPC_CHANNELS.NOTIFICATIONS_PUBLISH, { items }),
  },

  graph: {
    ancestors: (personId, depth) => invoke(IPC_CHANNELS.GRAPH_ANCESTORS, { personId, depth }),
    descendants: (personId, depth) => invoke(IPC_CHANNELS.GRAPH_DESCENDANTS, { personId, depth }),
    relations: (personId) => invoke(IPC_CHANNELS.GRAPH_RELATIONS, { personId }),
    network: (personId, depth) => invoke(IPC_CHANNELS.GRAPH_NETWORK, { personId, depth }),
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
    exportArchive: (options) => invoke(IPC_CHANNELS.GEDCOM_EXPORT_ARCHIVE, options),
    importArchive: (contentBase64) => invoke(IPC_CHANNELS.GEDCOM_IMPORT_ARCHIVE, { contentBase64 }),
  },

  accounts: {
    create: (data, token, performedBy) =>
      invoke(IPC_CHANNELS.ACCOUNTS_CREATE, { data, token, performedBy }),
    list: () => invoke(IPC_CHANNELS.ACCOUNTS_LIST),
    login: (name, pin) => invoke(IPC_CHANNELS.ACCOUNTS_LOGIN, { name, pin }),
    logout: (token) => invoke(IPC_CHANNELS.ACCOUNTS_LOGOUT, { token }),
    remove: (id, token, pin, performedBy) =>
      invoke(IPC_CHANNELS.ACCOUNTS_REMOVE, { id, token, pin, performedBy }),
  },

  backups: {
    create: (data, token, performedBy) =>
      invoke(IPC_CHANNELS.BACKUPS_CREATE, { data, token, performedBy }),
    list: (token) => invoke(IPC_CHANNELS.BACKUPS_LIST, { token }),
    verify: (filename, token) => invoke(IPC_CHANNELS.BACKUPS_VERIFY, { filename, token }),
    restore: (filename, kind, token, performedBy) =>
      invoke(IPC_CHANNELS.BACKUPS_RESTORE, { filename, kind, token, performedBy }),
    exportEncrypted: (filename, passphrase, token) =>
      invoke(IPC_CHANNELS.BACKUPS_EXPORT_ENCRYPTED, { filename, passphrase, token }),
    importEncrypted: (contentBase64, passphrase, token) =>
      invoke(IPC_CHANNELS.BACKUPS_IMPORT_ENCRYPTED, { contentBase64, passphrase, token }),
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
    get: (id) => invoke(IPC_CHANNELS.RESEARCH_GET, { id }),
    update: (id, data) => invoke(IPC_CHANNELS.RESEARCH_UPDATE, { id, data }),
    remove: (id) => invoke(IPC_CHANNELS.RESEARCH_REMOVE, { id }),
    addHypothesis: (researchId, data) =>
      invoke(IPC_CHANNELS.RESEARCH_ADD_HYPOTHESIS, { researchId, data }),
    updateHypothesis: (id, data) => invoke(IPC_CHANNELS.RESEARCH_UPDATE_HYPOTHESIS, { id, data }),
    removeHypothesis: (id) => invoke(IPC_CHANNELS.RESEARCH_REMOVE_HYPOTHESIS, { id }),
    addEvidence: (hypothesisId, data) =>
      invoke(IPC_CHANNELS.RESEARCH_ADD_EVIDENCE, { hypothesisId, data }),
    removeEvidence: (id) => invoke(IPC_CHANNELS.RESEARCH_REMOVE_EVIDENCE, { id }),
    addTask: (researchId, data) => invoke(IPC_CHANNELS.RESEARCH_ADD_TASK, { researchId, data }),
    updateTask: (id, data) => invoke(IPC_CHANNELS.RESEARCH_UPDATE_TASK, { id, data }),
    removeTask: (id) => invoke(IPC_CHANNELS.RESEARCH_REMOVE_TASK, { id }),
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
    listAll: (filters) => invoke(IPC_CHANNELS.NOTES_LIST_ALL, { filters }),
    update: (id, data) => invoke(IPC_CHANNELS.NOTES_UPDATE, { id, data }),
    remove: (id) => invoke(IPC_CHANNELS.NOTES_REMOVE, { id }),
  },

  media: {
    upload: (data, performedBy) => invoke(IPC_CHANNELS.MEDIA_UPLOAD, { data, performedBy }),
    get: (id) => invoke(IPC_CHANNELS.MEDIA_GET, { id }),
    download: (id) => invoke(IPC_CHANNELS.MEDIA_DOWNLOAD, { id }),
    listForEntity: (entityType, entityId) =>
      invoke(IPC_CHANNELS.MEDIA_LIST_FOR_ENTITY, { entityType, entityId }),
    listForSource: (sourceId) => invoke(IPC_CHANNELS.MEDIA_LIST_FOR_SOURCE, { sourceId }),
    remove: (id, performedBy) => invoke(IPC_CHANNELS.MEDIA_REMOVE, { id, performedBy }),
    photo: (id) => invoke(IPC_CHANNELS.MEDIA_PHOTO_GET, { id }),
    updatePhoto: (id, data) => invoke(IPC_CHANNELS.MEDIA_PHOTO_UPDATE, { id, data }),
    addRegion: (id, data) => invoke(IPC_CHANNELS.MEDIA_REGION_ADD, { id, data }),
    removeRegion: (regionId) => invoke(IPC_CHANNELS.MEDIA_REGION_REMOVE, { regionId }),
    photosForPerson: (personId) => invoke(IPC_CHANNELS.MEDIA_PHOTOS_FOR_PERSON, { personId }),
    decode: (id, data) => invoke(IPC_CHANNELS.MEDIA_DECODE, { id, data }),
    saveTranscription: (id, data) => invoke(IPC_CHANNELS.MEDIA_TRANSCRIPTION_SAVE, { id, data }),
    owners: (id) => invoke(IPC_CHANNELS.MEDIA_OWNERS, { id }),
    link: (id, data) => invoke(IPC_CHANNELS.MEDIA_LINK, { id, data }),
    identify: (data) => invoke(IPC_CHANNELS.MEDIA_IDENTIFY, { data }),
    setPortrait: (personId, data) =>
      invoke(IPC_CHANNELS.PERSONS_SET_PORTRAIT, { id: personId, data }),
    uploadPortrait: (personId, data) =>
      invoke(IPC_CHANNELS.PERSONS_UPLOAD_PORTRAIT, { id: personId, data }),
  },

  indexing: {
    status: () => invoke(IPC_CHANNELS.INDEXING_STATUS),
    search: (q, limit) => invoke(IPC_CHANNELS.INDEXING_SEARCH, { q, limit }),
    addSource: (data) => invoke(IPC_CHANNELS.INDEXING_ADD_SOURCE, { data }),
    setSource: (id, enabled) => invoke(IPC_CHANNELS.INDEXING_SET_SOURCE, { id, enabled }),
    removeSource: (id) => invoke(IPC_CHANNELS.INDEXING_REMOVE_SOURCE, { id }),
    updateSettings: (data) => invoke(IPC_CHANNELS.INDEXING_SETTINGS, { data }),
    run: () => invoke(IPC_CHANNELS.INDEXING_RUN),
    searchPage: (q, options) => invoke(IPC_CHANNELS.INDEXING_SEARCH_PAGE, { q, options }),
    document: (id) => invoke(IPC_CHANNELS.INDEXING_DOCUMENT, { id }),
    updateSource: (id, data) => invoke(IPC_CHANNELS.INDEXING_UPDATE_SOURCE, { id, data }),
    runSource: (id) => invoke(IPC_CHANNELS.INDEXING_RUN_SOURCE, { id }),
    clearSource: (id) => invoke(IPC_CHANNELS.INDEXING_CLEAR_SOURCE, { id }),
    cancel: () => invoke(IPC_CHANNELS.INDEXING_CANCEL),
  },
  quality: (personId) => invoke(IPC_CHANNELS.PERSON_QUALITY, { personId }),
  advancedSearch: (filters) => invoke(IPC_CHANNELS.SEARCH_ADVANCED, { filters }),

  history: {
    status: (limit) => invoke(IPC_CHANNELS.HISTORY_STATUS, { limit }),
    undo: () => invoke(IPC_CHANNELS.HISTORY_UNDO),
    redo: () => invoke(IPC_CHANNELS.HISTORY_REDO),
  },

  storage: {
    status: () => invoke(IPC_CHANNELS.STORAGE_STATUS),
    setMirror: (mirrorDir, token) => invoke(IPC_CHANNELS.STORAGE_SET_MIRROR, { mirrorDir, token }),
    setDataDir: (dataDir, token) => invoke(IPC_CHANNELS.STORAGE_SET_DATA_DIR, { dataDir, token }),
  },

  settings: {
    // Informe le process principal du mode de carte choisi, pour ajuster la
    // Content-Security-Policy (tuiles OpenStreetMap autorisées uniquement en
    // mode « en ligne » explicite).
    setMapMode: (mode) => ipcRenderer.invoke('geneoapp:settings:setMapMode', mode),
  },

  // Jeton du serveur HTTP local embarqué : requis pour l'appeler directement
  // (hors IPC) sans être bloqué par local-http-guard.js.
  httpToken,

  trees: {
    list: () => invoke(IPC_CHANNELS.TREES_LIST),
    active: () => invoke(IPC_CHANNELS.TREES_ACTIVE),
    listDeleted: () => invoke(IPC_CHANNELS.TREES_LIST_DELETED),
    create: (data) => invoke(IPC_CHANNELS.TREES_CREATE, { data }),
    update: (id, data) => invoke(IPC_CHANNELS.TREES_UPDATE, { id, data }),
    activate: (id) => invoke(IPC_CHANNELS.TREES_ACTIVATE, { id }),
    remove: (id, token) => invoke(IPC_CHANNELS.TREES_REMOVE, { id, token }),
    restore: (id, token) => invoke(IPC_CHANNELS.TREES_RESTORE, { id, token }),
  },
};

contextBridge.exposeInMainWorld('geneoapp', api);
