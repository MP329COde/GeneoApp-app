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
});
