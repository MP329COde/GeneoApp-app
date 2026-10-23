import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGeneoAppClient, createIpcClient } from './geneoapp-client.js';

function jsonResponse(payload) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(payload),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('client API — pagination de la liste des personnes', () => {
  it('charge une page et renvoie le total connu du serveur', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        items: [{ id: 1, given_names: 'Ada', family_name: 'Lovelace' }],
        total: 42,
        limit: 10,
        offset: 20,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const page = await createGeneoAppClient().persons.list({ limit: 10, offset: 20 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/persons?limit=10&offset=20');
    expect(page.total).toBe(42);
    expect(page.items).toHaveLength(1);
  });

  it('transmet le filtre de recherche', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ items: [], total: 0, limit: 10, offset: 0 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await createGeneoAppClient().persons.list({ limit: 10, q: 'Dupont' });

    expect(fetchMock.mock.calls[0][0]).toBe('/api/persons?limit=10&offset=0&q=Dupont');
  });

  it('borne la taille de page demandée et retombe sur la valeur par défaut', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ items: [], total: 0, limit: 200, offset: 0 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = createGeneoAppClient();

    await client.persons.list({ limit: 100000 });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/persons?limit=200&offset=0');

    await client.persons.list({ limit: 'abc' });
    expect(fetchMock.mock.calls[1][0]).toBe('/api/persons?limit=50&offset=0');
  });

  it('demande uniquement le total quand on le demande', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ total: 7 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await createGeneoAppClient().persons.list({ total: true });

    expect(fetchMock.mock.calls[0][0]).toBe('/api/persons?total=true');
    expect(result).toEqual({ total: 7 });
  });

  it('charge la liste complète en une seule requête', async () => {
    const people = Array.from({ length: 250 }, (_, index) => ({ id: index + 1 }));
    const fetchMock = vi.fn(async () =>
      jsonResponse({ items: people, total: 250, limit: 250, offset: 0 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await createGeneoAppClient().persons.list();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/persons');
    expect(result.items).toHaveLength(250);
    expect(result.total).toBe(250);
  });

  it('normalise une réponse serveur qui renvoie un tableau brut', async () => {
    const people = [{ id: 1 }, { id: 2 }];
    const fetchMock = vi.fn(async () => jsonResponse(people));
    vi.stubGlobal('fetch', fetchMock);

    const result = await createGeneoAppClient().persons.list();

    expect(fetchMock.mock.calls[0][0]).toBe('/api/persons');
    expect(result).toEqual({ items: people, total: 2, limit: 2, offset: 0 });
  });

  it('complète une enveloppe dont limit et offset manquent', async () => {
    const people = [{ id: 1 }];
    const fetchMock = vi.fn(async () => jsonResponse({ items: people, total: 1 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await createGeneoAppClient().persons.list();

    expect(result).toEqual({ items: people, total: 1, limit: 1, offset: 0 });
  });
});

describe('client API — transport IPC (Electron)', () => {
  const people = [
    { id: 1, given_names: 'Jean', family_name: 'Dupont' },
    { id: 2, given_names: 'Marie', family_name: 'Durand' },
    { id: 3, given_names: 'Paul', family_name: 'Dupont' },
  ];

  function createBridge(list = people) {
    return {
      persons: {
        list: vi.fn(async () => list),
      },
    };
  }

  it('renvoie toute la liste dans une enveloppe normalisée', async () => {
    const bridge = createBridge();
    const client = createIpcClient(bridge);

    const result = await client.persons.list();

    expect(result).toEqual({ items: people, total: 3, limit: 3, offset: 0 });
  });

  it('découpe une page décalée tout en conservant le total', async () => {
    const client = createIpcClient(createBridge());

    const result = await client.persons.list({ limit: 2, offset: 1 });

    expect(result.items).toEqual([people[1], people[2]]);
    expect(result.total).toBe(3);
    expect(result.limit).toBe(2);
    expect(result.offset).toBe(1);
  });

  it('renvoie uniquement le total quand on le demande', async () => {
    const client = createIpcClient(createBridge());

    const result = await client.persons.list({ total: true });

    expect(result).toEqual({ total: 3 });
  });

  it('filtre par nom comme le serveur', async () => {
    const client = createIpcClient(createBridge());

    const result = await client.persons.list({ limit: 10, q: 'dupont' });

    expect(result.items).toEqual([people[0], people[2]]);
    expect(result.total).toBe(2);
  });

  it('aligne le filtrage sur la sémantique SQL du serveur', async () => {
    const bridge = createBridge([
      { id: 1, given_names: null, family_name: 'Dupont' },
      { id: 2, given_names: 'Élodie', family_name: 'Durand' },
    ]);
    const client = createIpcClient(bridge);

    // `given_names || ' ' || family_name` vaut NULL : aucune correspondance.
    const byFamily = await client.persons.list({ q: 'dupont' });
    expect(byFamily.items).toEqual([]);

    // SQLite ne replie que l'ASCII : les accents ne sont pas normalisés.
    const byAccent = await client.persons.list({ q: 'élodie' });
    expect(byAccent.items).toEqual([]);

    const exactAccent = await client.persons.list({ q: 'Élodie' });
    expect(exactAccent.items).toHaveLength(1);
  });

  it('renvoie une liste vide', async () => {
    const client = createIpcClient(createBridge([]));

    const result = await client.persons.list();

    expect(result.total).toBe(0);
    expect(result.items).toEqual([]);
    expect(result.limit).toBe(0);
  });
});
