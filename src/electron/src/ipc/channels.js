// Allowlist des canaux IPC exposés au renderer. Toute invocation d'un canal
// absent de cette liste est ignorée par ipcMain (aucun handler enregistré).
export const IPC_CHANNELS = Object.freeze({
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

  ACCOUNTS_CREATE: 'geneoapp:accounts:create',
  ACCOUNTS_LIST: 'geneoapp:accounts:list',
  ACCOUNTS_LOGIN: 'geneoapp:accounts:login',
  ACCOUNTS_LOGOUT: 'geneoapp:accounts:logout',
  ACCOUNTS_REMOVE: 'geneoapp:accounts:remove',

  BACKUPS_CREATE: 'geneoapp:backups:create',
  BACKUPS_LIST: 'geneoapp:backups:list',
  BACKUPS_VERIFY: 'geneoapp:backups:verify',
  BACKUPS_RESTORE: 'geneoapp:backups:restore',

  TRASH_LIST: 'geneoapp:trash:list',
  TRASH_RESTORE: 'geneoapp:trash:restore',
  TRASH_PURGE: 'geneoapp:trash:purge',

  RESEARCH_CREATE: 'geneoapp:research:create',
  RESEARCH_LIST: 'geneoapp:research:list',

  STATISTICS_TOTALS: 'geneoapp:statistics:totals',

  AI_ANALYZE: 'geneoapp:ai:analyze',

  NOTES_CREATE: 'geneoapp:notes:create',
  NOTES_LIST_FOR_ENTITY: 'geneoapp:notes:listForEntity',
  NOTES_GET: 'geneoapp:notes:get',

  MEDIA_UPLOAD: 'geneoapp:media:upload',
  MEDIA_GET: 'geneoapp:media:get',
  MEDIA_DOWNLOAD: 'geneoapp:media:download',
  MEDIA_LIST_FOR_ENTITY: 'geneoapp:media:listForEntity',
  MEDIA_LIST_FOR_SOURCE: 'geneoapp:media:listForSource',
  MEDIA_REMOVE: 'geneoapp:media:remove',

  TREES_LIST: 'geneoapp:trees:list',
  TREES_ACTIVE: 'geneoapp:trees:active',
  TREES_LIST_DELETED: 'geneoapp:trees:listDeleted',
  TREES_CREATE: 'geneoapp:trees:create',
  TREES_UPDATE: 'geneoapp:trees:update',
  TREES_ACTIVATE: 'geneoapp:trees:activate',
  TREES_REMOVE: 'geneoapp:trees:remove',
  TREES_RESTORE: 'geneoapp:trees:restore',
});
