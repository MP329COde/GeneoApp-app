// Routes de l'API locale utilisées par les écrans récents : affirmations et
// contradictions, identifiants externes, historique des lieux, fiche famille,
// liens de médias, chemins et cohérence du graphe, historique d'une recherche.
//
// Une seule définition pour les deux transports : `request(method, path, body)`
// est soit un `fetch` vers l'API REST (navigateur), soit la passerelle IPC
// `api.request` d'Electron. Chaque route n'est donc écrite qu'une fois, avec la
// même validation côté serveur que pour tout autre appel.

function query(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export function createExtendedApi(request) {
  const get = (path) => request('GET', path);
  const post = (path, body) => request('POST', path, body ?? {});
  const patch = (path, body) => request('PATCH', path, body);
  const del = (path) => request('DELETE', path);

  return {
    assertions: {
      list: (params) => get(`/api/assertions${query(params)}`),
      conflicts: (params) => get(`/api/assertions/conflicts${query(params)}`),
      get: (id) => get(`/api/assertions/${id}`),
      create: (data) => post('/api/assertions', data),
      update: (id, data) => patch(`/api/assertions/${id}`, data),
      accept: (id) => post(`/api/assertions/${id}/accept`),
      reject: (id) => post(`/api/assertions/${id}/reject`),
      reopen: (id) => post(`/api/assertions/${id}/reopen`),
      remove: (id) => del(`/api/assertions/${id}`),
    },
    persons: {
      listIdentifiers: (id) => get(`/api/persons/${id}/identifiers`),
      addIdentifier: (id, data) => post(`/api/persons/${id}/identifiers`, data),
      removeIdentifier: (id, identifierId) => del(`/api/persons/${id}/identifiers/${identifierId}`),
      findByIdentifier: (scheme, value) =>
        get(`/api/persons/by-identifier${query({ scheme, value })}`),
    },
    places: {
      update: (id, data) => patch(`/api/places/${id}`, data),
      listNames: (id) => get(`/api/places/${id}/names`),
      addName: (id, data) => post(`/api/places/${id}/names`, data),
      removeName: (id, nameId) => del(`/api/places/${id}/names/${nameId}`),
      listParents: (id) => get(`/api/places/${id}/parents`),
      addParent: (id, data) => post(`/api/places/${id}/parents`, data),
      removeParent: (id, linkId) => del(`/api/places/${id}/parents/${linkId}`),
      resolve: (id, year) => get(`/api/places/${id}/resolve${query({ year })}`),
    },
    events: {
      update: (id, data) => patch(`/api/events/${id}`, data),
      removeParticipant: (id, participantId) =>
        del(`/api/events/${id}/participants/${participantId}`),
    },
    unions: {
      list: () => get('/api/unions'),
      update: (id, data) => patch(`/api/unions/${id}`, data),
      addPartner: (id, personId) => post(`/api/unions/${id}/partners`, { personId }),
      removePartner: (id, personId) => del(`/api/unions/${id}/partners/${personId}`),
      family: (id) => get(`/api/unions/${id}/family`),
      familiesOf: (personId) => get(`/api/unions/families-of/${personId}`),
    },
    parentages: {
      list: () => get('/api/parentages'),
      update: (id, data) => patch(`/api/parentages/${id}`, data),
    },
    sources: {
      list: () => get('/api/sources'),
      update: (id, data) => patch(`/api/sources/${id}`, data),
      remove: (id) => del(`/api/sources/${id}`),
      getCitation: (id) => get(`/api/sources/citation/${id}`),
      updateCitation: (id, data) => patch(`/api/sources/citation/${id}`, data),
      removeCitation: (id) => del(`/api/sources/citation/${id}`),
    },
    mediaLinks: {
      list: (mediaId) => get(`/api/media/${mediaId}/links`),
      add: (mediaId, data) => post(`/api/media/${mediaId}/links`, data),
      remove: (mediaId, linkId) => del(`/api/media/${mediaId}/links/${linkId}`),
      addUrl: (data) => post('/api/media/url', data),
    },
    graphExtras: {
      paths: (personA, personB, options = {}) =>
        get(
          `/api/graph/path${query({ personA, personB, depth: options.depth, limit: options.limit })}`,
        ),
      consistency: () => get('/api/graph/consistency'),
    },
    notebookExtras: {
      history: (id) => get(`/api/notebook/${id}/history`),
    },
  };
}

/**
 * Fusionne les routes étendues dans le client existant : un espace de noms
 * existant (persons, places…) garde ses méthodes, les nouvelles s'y ajoutent ;
 * `graphExtras`, `notebookExtras` et `mediaLinks` rejoignent graph, research et
 * media sous les noms indiqués.
 */
export function mergeExtendedApi(client, extension) {
  const merged = { ...client };
  const into = (target, methods) => {
    merged[target] = { ...(merged[target] ?? {}), ...methods };
  };
  for (const [name, methods] of Object.entries(extension)) {
    if (name === 'graphExtras') into('graph', methods);
    else if (name === 'notebookExtras') into('research', methods);
    else if (name === 'mediaLinks') {
      into('media', {
        listLinks: methods.list,
        addLink: methods.add,
        removeLink: methods.remove,
        addUrl: methods.addUrl,
      });
    } else into(name, methods);
  }
  return merged;
}
