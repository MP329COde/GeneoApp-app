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

function base64ToBlob(base64, mimeType) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

function parseContentDispositionFilename(header) {
  const match = /filename\*?=(?:UTF-8''|")?([^";]+)"?/i.exec(header ?? '');
  return match ? decodeURIComponent(match[1]) : 'fichier';
}

function createHttpClient() {
  return {
    persons: {
      list: () => fetchJson('/api/persons'),
      get: (id) => fetchJson(`/api/persons/${id}`),
      create: (data) => fetchJson('/api/persons', { method: 'POST', body: data }),
      update: (id, data) => fetchJson(`/api/persons/${id}`, { method: 'PATCH', body: data }),
    },
    places: {
      create: (data) => fetchJson('/api/places', { method: 'POST', body: data }),
      list: () => fetchJson('/api/places'),
      get: (id) => fetchJson(`/api/places/${id}`),
      remove: (id) => fetchJson(`/api/places/${id}`, { method: 'DELETE' }),
    },
    events: {
      create: (data) => fetchJson('/api/events', { method: 'POST', body: data }),
      get: (id) => fetchJson(`/api/events/${id}`),
      listAll: () => fetchJson('/api/events'),
      listForPerson: (personId) => fetchJson(`/api/events/by-person/${personId}`),
      addParticipant: (id, data) =>
        fetchJson(`/api/events/${id}/participants`, { method: 'POST', body: data }),
      remove: (id) => fetchJson(`/api/events/${id}`, { method: 'DELETE' }),
    },
    audit: {
      listForEntity: (tableName, rowId) => fetchJson(`/api/audit/${tableName}/${rowId}`),
    },
    graph: {
      ancestors: (personId, depth) =>
        fetchJson(`/api/persons/${personId}/ancestors${depth ? `?depth=${depth}` : ''}`),
      descendants: (personId, depth) =>
        fetchJson(`/api/persons/${personId}/descendants${depth ? `?depth=${depth}` : ''}`),
      relations: (personId) => fetchJson(`/api/persons/${personId}/relations`),
      relationship: (personA, personB) =>
        fetchJson(`/api/graph/relationship?personA=${personA}&personB=${personB}`),
      commonAncestors: (personA, personB) =>
        fetchJson(`/api/graph/common-ancestors?personA=${personA}&personB=${personB}`),
      cycles: () => fetchJson('/api/graph/cycles'),
      timeline: () => fetchJson('/api/graph/timeline'),
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
      merge: (survivorId, duplicateId) =>
        fetchJson('/api/search/merge', { method: 'POST', body: { survivorId, duplicateId } }),
      previewMerge: (survivorId, duplicateId) =>
        fetchJson(`/api/search/merge/preview?${new URLSearchParams({ survivorId, duplicateId })}`),
    },
    unions: {
      create: (data) => fetchJson('/api/unions', { method: 'POST', body: data }),
      get: (id) => fetchJson(`/api/unions/${id}`),
      listForPerson: (personId) => fetchJson(`/api/unions/by-person/${personId}`),
      remove: (id) => fetchJson(`/api/unions/${id}`, { method: 'DELETE' }),
    },
    parentages: {
      create: (data) => fetchJson('/api/parentages', { method: 'POST', body: data }),
      get: (id) => fetchJson(`/api/parentages/${id}`),
      listParentsOf: (personId) => fetchJson(`/api/parentages/parents-of/${personId}`),
      listChildrenOf: (personId) => fetchJson(`/api/parentages/children-of/${personId}`),
      remove: (id) => fetchJson(`/api/parentages/${id}`, { method: 'DELETE' }),
    },
    sources: {
      create: (data) => fetchJson('/api/sources', { method: 'POST', body: data }),
      get: (id) => fetchJson(`/api/sources/${id}`),
      addCitation: (data) => fetchJson('/api/sources/citations', { method: 'POST', body: data }),
      listCitationsForEntity: (entityType, entityId) =>
        fetchJson(`/api/sources/citations/${entityType}/${entityId}`),
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
      remove: (id, token) => fetchJson(`/api/accounts/${id}`, { method: 'DELETE', token }),
    },
    backups: {
      create: (data, token) => fetchJson('/api/backups', { method: 'POST', body: data, token }),
      list: (token) => fetchJson('/api/backups', { token }),
      verify: (filename, token) =>
        fetchJson(`/api/backups/${encodeURIComponent(filename)}/verify`, { token }),
      restore: (filename, kind, token) =>
        fetchJson(
          `/api/backups/${encodeURIComponent(filename)}/restore${kind === 'sqlite' ? '?kind=sqlite' : ''}`,
          { method: 'POST', token },
        ),
    },
    trash: {
      list: (token) => fetchJson('/api/trash', { token }),
      restore: (table, id, token) =>
        fetchJson(`/api/trash/${table}/${id}/restore`, { method: 'POST', token }),
      purge: (table, id, token) =>
        fetchJson(`/api/trash/${table}/${id}`, { method: 'DELETE', token }),
    },
    research: {
      create: (data) => fetchJson('/api/notebook', { method: 'POST', body: data }),
      list: () => fetchJson('/api/notebook'),
    },
    statistics: {
      totals: () => fetchJson('/api/statistics'),
    },
    ai: {
      analyze: (prompt) => fetchJson('/api/ai/analyze', { method: 'POST', body: { prompt } }),
    },
    notes: {
      create: (data) => fetchJson('/api/notes', { method: 'POST', body: data }),
      listForEntity: (entityType, entityId) => fetchJson(`/api/notes/${entityType}/${entityId}`),
      get: (id) => fetchJson(`/api/notes/by-id/${id}`),
    },
    media: {
      upload: (data) => fetchJson('/api/media', { method: 'POST', body: data }),
      get: (id) => fetchJson(`/api/media/${id}`),
      download: async (id) => {
        const response = await fetch(`/api/media/${id}/content`);
        if (!response.ok) {
          throw new Error('Impossible de télécharger le média');
        }
        const blob = await response.blob();
        const filename = parseContentDispositionFilename(
          response.headers.get('content-disposition'),
        );
        return { filename, blob };
      },
      listForEntity: (entityType, entityId) =>
        fetchJson(`/api/media/by-entity/${entityType}/${entityId}`),
      listForSource: (sourceId) => fetchJson(`/api/media/by-source/${sourceId}`),
      remove: (id) => fetchJson(`/api/media/${id}`, { method: 'DELETE' }),
    },
  };
}

function createIpcClient(bridge) {
  return {
    persons: {
      list: () => bridge.persons.list(),
      get: (id) => bridge.persons.get(id),
      create: (data) => bridge.persons.create(data),
      update: (id, data) => bridge.persons.update(id, data),
    },
    places: {
      create: (data) => bridge.places.create(data),
      list: () => bridge.places.list(),
      get: (id) => bridge.places.get(id),
      remove: (id) => bridge.places.remove(id),
    },
    events: {
      create: (data) => bridge.events.create(data),
      get: (id) => bridge.events.get(id),
      listAll: () => bridge.events.listAll(),
      listForPerson: (personId) => bridge.events.listForPerson(personId),
      addParticipant: (id, data) => bridge.events.addParticipant(id, data),
      remove: (id) => bridge.events.remove(id),
    },
    audit: {
      listForEntity: (tableName, rowId) => bridge.audit.listForEntity(tableName, rowId),
    },
    graph: {
      ancestors: (personId, depth) => bridge.graph.ancestors(personId, depth),
      descendants: (personId, depth) => bridge.graph.descendants(personId, depth),
      relations: (personId) => bridge.graph.relations(personId),
      relationship: (personA, personB) => bridge.graph.relationship(personA, personB),
      commonAncestors: (personA, personB) => bridge.graph.commonAncestors(personA, personB),
      cycles: () => bridge.graph.cycles(),
      timeline: () => bridge.graph.timeline(),
    },
    search: {
      query: (q, entityTypes) => bridge.search.query(q, entityTypes),
      duplicates: (limit) => bridge.search.duplicates(limit),
      merge: (survivorId, duplicateId) => bridge.search.merge(survivorId, duplicateId),
      previewMerge: (survivorId, duplicateId) =>
        bridge.search.previewMerge(survivorId, duplicateId),
    },
    unions: {
      create: (data) => bridge.unions.create(data),
      get: (id) => bridge.unions.get(id),
      listForPerson: (personId) => bridge.unions.listForPerson(personId),
      remove: (id) => bridge.unions.remove(id),
    },
    parentages: {
      create: (data) => bridge.parentages.create(data),
      get: (id) => bridge.parentages.get(id),
      listParentsOf: (personId) => bridge.parentages.listParentsOf(personId),
      listChildrenOf: (personId) => bridge.parentages.listChildrenOf(personId),
      remove: (id) => bridge.parentages.remove(id),
    },
    sources: {
      create: (data) => bridge.sources.create(data),
      get: (id) => bridge.sources.get(id),
      addCitation: (data) => bridge.sources.addCitation(data),
      listCitationsForEntity: (entityType, entityId) =>
        bridge.sources.listCitationsForEntity(entityType, entityId),
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
      remove: (id, token) => bridge.accounts.remove(id, token),
    },
    backups: {
      create: (data, token) => bridge.backups.create(data, token),
      list: (token) => bridge.backups.list(token),
      verify: (filename, token) => bridge.backups.verify(filename, token),
      restore: (filename, kind, token) => bridge.backups.restore(filename, kind, token),
    },
    trash: {
      list: (token) => bridge.trash.list(token),
      restore: (table, id, token) => bridge.trash.restore(table, id, token),
      purge: (table, id, token) => bridge.trash.purge(table, id, token),
    },
    research: {
      create: (data) => bridge.research.create(data),
      list: () => bridge.research.list(),
    },
    statistics: {
      totals: () => bridge.statistics.totals(),
    },
    ai: {
      analyze: (prompt) => bridge.ai.analyze(prompt),
    },
    notes: {
      create: (data) => bridge.notes.create(data),
      listForEntity: (entityType, entityId) => bridge.notes.listForEntity(entityType, entityId),
      get: (id) => bridge.notes.get(id),
    },
    media: {
      upload: (data) => bridge.media.upload(data),
      get: (id) => bridge.media.get(id),
      download: async (id) => {
        const { filename, mimeType, contentBase64 } = await bridge.media.download(id);
        return { filename, blob: base64ToBlob(contentBase64, mimeType) };
      },
      listForEntity: (entityType, entityId) => bridge.media.listForEntity(entityType, entityId),
      listForSource: (sourceId) => bridge.media.listForSource(sourceId),
      remove: (id) => bridge.media.remove(id),
    },
  };
}

export function createGeneoAppClient() {
  if (typeof window !== 'undefined' && window.geneoapp) {
    return createIpcClient(window.geneoapp);
  }
  return createHttpClient();
}
