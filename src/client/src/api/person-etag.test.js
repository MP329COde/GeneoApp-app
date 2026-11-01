import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGeneoAppClient } from './geneoapp-client.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

const jsonResponse = (payload, etag) => ({
  ok: true,
  status: 200,
  headers: { get: (name) => (name.toLowerCase() === 'etag' ? (etag ?? null) : null) },
  text: async () => JSON.stringify(payload),
});

describe('client API — concurrence optimiste (If-Match)', () => {
  it('mémorise l’ETag du GET, l’envoie en If-Match, puis garde celui du PATCH', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: 7 }, '"v1"'))
      .mockResolvedValueOnce(jsonResponse({ id: 7 }, '"v2"'))
      .mockResolvedValueOnce(jsonResponse({ id: 7 }, '"v3"'));
    vi.stubGlobal('fetch', fetchMock);
    const { persons } = createGeneoAppClient();

    await persons.get(7);
    await persons.update(7, { givenNames: 'A' });
    await persons.update(7, { givenNames: 'B' });

    expect(fetchMock.mock.calls[1][1].headers['if-match']).toBe('"v1"');
    expect(fetchMock.mock.calls[2][1].headers['if-match']).toBe('"v2"');
  });

  it('sans ETag connu, pas d’If-Match ; une ligne de liste donne l’ETag via updated_at', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: 3 }));
    vi.stubGlobal('fetch', fetchMock);
    const { persons } = createGeneoAppClient();

    await persons.update(9, {});
    expect(fetchMock.mock.calls[0][1].headers['if-match']).toBeUndefined();

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ items: [{ id: 3, updated_at: 'T1' }], total: 1, limit: 1, offset: 0 }),
    );
    await persons.list();
    await persons.update(3, {});
    expect(fetchMock.mock.calls[2][1].headers['if-match']).toBe('"T1"');
  });

  it('expose status 409 et code EDIT_CONFLICT sur conflit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 409,
        text: async () => JSON.stringify({ error: { code: 'EDIT_CONFLICT', message: 'Conflit' } }),
      })),
    );
    await expect(createGeneoAppClient().persons.update(1, {})).rejects.toMatchObject({
      status: 409,
      code: 'EDIT_CONFLICT',
    });
  });
});
