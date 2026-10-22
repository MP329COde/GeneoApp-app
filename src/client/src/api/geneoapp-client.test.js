import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGeneoAppClient } from './geneoapp-client.js';

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

  it('charge la liste complète page par page', async () => {
    const pages = [
      { items: Array.from({ length: 200 }, (_, index) => ({ id: index + 1 })), total: 250 },
      { items: Array.from({ length: 50 }, (_, index) => ({ id: 201 + index })), total: 250 },
    ];
    const fetchMock = vi.fn(async () => jsonResponse(pages[fetchMock.mock.calls.length - 1]));
    vi.stubGlobal('fetch', fetchMock);

    const result = await createGeneoAppClient().persons.list();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/persons?limit=200&offset=0');
    expect(fetchMock.mock.calls[1][0]).toBe('/api/persons?limit=200&offset=200');
    expect(result.items).toHaveLength(250);
    expect(result.total).toBe(250);
  });
});
