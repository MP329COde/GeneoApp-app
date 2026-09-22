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

async function fetchJson(path, { method = 'GET', body, token } = {}) {
  const response = await fetch(path, {
    method,
    headers: {
      ...(body === undefined ? undefined : { 'content-type': 'application/json' }),
      ...(token ? { 'x-geneoapp-session': token } : undefined),
    },
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
    unions: {
      create: (data) => fetchJson('/api/unions', { method: 'POST', body: data }),
      get: (id) => fetchJson(`/api/unions/${id}`),
      listForPerson: (personId) => fetchJson(`/api/unions/by-person/${personId}`),
      remove: (id) => fetchJson(`/api/unions/${id}`, { method: 'DELETE' }),
    },
    gedcom: {
      preview: (gedcom) => fetchJson('/api/gedcom/preview', { method: 'POST', body: { gedcom } }),
      import: (gedcom) => fetchJson('/api/gedcom/import', { method: 'POST', body: { gedcom } }),
      export: (options) => fetchJson('/api/gedcom/export', { method: 'POST', body: options }),
    },
    accounts: {
      create: (data) => fetchJson('/api/accounts', { method: 'POST', body: data }),
      list: () => fetchJson('/api/accounts'),
      login: (name, pin) =>
        fetchJson('/api/accounts/login', { method: 'POST', body: { name, pin } }),
      logout: (token) => fetchJson('/api/accounts/logout', { method: 'POST', token }),
    },
    backups: {
      create: (data, token) => fetchJson('/api/backups', { method: 'POST', body: data, token }),
      list: () => fetchJson('/api/backups'),
      verify: (filename) => fetchJson(`/api/backups/${encodeURIComponent(filename)}/verify`),
      restore: (filename, kind, token) =>
        fetchJson(
          `/api/backups/${encodeURIComponent(filename)}/restore${kind === 'sqlite' ? '?kind=sqlite' : ''}`,
          { method: 'POST', token },
        ),
    },
    trash: {
      list: () => fetchJson('/api/trash'),
      restore: (table, id, token) =>
        fetchJson(`/api/trash/${table}/${id}/restore`, { method: 'POST', token }),
      purge: (table, id, token) =>
        fetchJson(`/api/trash/${table}/${id}`, { method: 'DELETE', token }),
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
    unions: {
      create: (data) => bridge.unions.create(data),
      get: (id) => bridge.unions.get(id),
      listForPerson: (personId) => bridge.unions.listForPerson(personId),
      remove: (id) => bridge.unions.remove(id),
    },
    gedcom: {
      preview: (gedcom) => bridge.gedcom.preview(gedcom),
      import: (gedcom) => bridge.gedcom.import(gedcom),
      export: (options) => bridge.gedcom.export(options),
    },
    accounts: {
      create: (data) => bridge.accounts.create(data),
      list: () => bridge.accounts.list(),
      login: (name, pin) => bridge.accounts.login(name, pin),
      logout: (token) => bridge.accounts.logout(token),
    },
    backups: {
      create: (data, token) => bridge.backups.create(data, token),
      list: () => bridge.backups.list(),
      verify: (filename) => bridge.backups.verify(filename),
      restore: (filename, kind, token) => bridge.backups.restore(filename, kind, token),
    },
    trash: {
      list: () => bridge.trash.list(),
      restore: (table, id, token) => bridge.trash.restore(table, id, token),
      purge: (table, id, token) => bridge.trash.purge(table, id, token),
    },
  };
}

export function createGeneoAppClient() {
  if (typeof window !== 'undefined' && window.geneoapp) {
    return createIpcClient(window.geneoapp);
  }
  return createHttpClient();
}
