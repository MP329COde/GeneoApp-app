// Point d'accès unique aux données métier depuis le renderer.
//
// Le frontend ne doit jamais contenir de logique généalogique : ce module ne
// fait qu'appeler l'API locale, via l'un des deux transports possibles selon
// le contexte d'exécution -- jamais de données fictives en repli.
//
// - Dans Electron (production) : `window.geneoapp`, exposé par le préload via
//   contextBridge, qui relaie chaque appel à travers l'allowlist IPC
//   (`src/electron/src/ipc/channels.js`). Le renderer n'a jamais accès direct
//   à Node ni à ipcRenderer.
// - En développement navigateur (`npm run dev`, ou tests) : `window.geneoapp`
//   n'existe pas, le client tourne sur le serveur Vite. On appelle alors
//   directement l'API REST locale via `fetch`, relayée par le proxy Vite
//   `/api` (voir vite.config.js) vers le serveur Express local.

async function fetchJson(path, { method = 'GET', body } = {}) {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(data?.error?.message ?? 'Erreur API inconnue');
    error.status = response.status;
    error.fields = data?.error?.fields;
    throw error;
  }
  return data;
}

function createHttpClient() {
  return {
    persons: {
      list: () => fetchJson('/api/persons'),
      get: (id) => fetchJson(`/api/persons/${id}`),
      create: (data) => fetchJson('/api/persons', { method: 'POST', body: data }),
    },
    graph: {
      ancestors: (personId, depth) =>
        fetchJson(`/api/persons/${personId}/ancestors${depth ? `?depth=${depth}` : ''}`),
      descendants: (personId, depth) =>
        fetchJson(`/api/persons/${personId}/descendants${depth ? `?depth=${depth}` : ''}`),
      relations: (personId) => fetchJson(`/api/persons/${personId}/relations`),
      relationship: (personA, personB) =>
        fetchJson(`/api/graph/relationship?personA=${personA}&personB=${personB}`),
    },
    search: {
      query: (q, entityTypes) =>
        fetchJson(
          `/api/search?${new URLSearchParams({
            q,
            ...(entityTypes ? { entityTypes: entityTypes.join(',') } : {}),
          })}`,
        ),
      duplicates: (limit) => fetchJson(`/api/search/duplicates?limit=${limit ?? 100}`),
    },
  };
}

function createIpcClient(bridge) {
  return {
    persons: {
      list: () => bridge.persons.list(),
      get: (id) => bridge.persons.get(id),
      create: (data) => bridge.persons.create(data),
    },
    graph: {
      ancestors: (personId, depth) => bridge.graph.ancestors(personId, depth),
      descendants: (personId, depth) => bridge.graph.descendants(personId, depth),
      relations: (personId) => bridge.graph.relations(personId),
      relationship: (personA, personB) => bridge.graph.relationship(personA, personB),
    },
    search: {
      query: (q, entityTypes) => bridge.search.query(q, entityTypes),
      duplicates: (limit) => bridge.search.duplicates(limit),
    },
  };
}

export function createGeneoAppClient() {
  if (typeof window !== 'undefined' && window.geneoapp) {
    return createIpcClient(window.geneoapp);
  }
  return createHttpClient();
}
