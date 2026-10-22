import { describe, expect, it, vi } from 'vitest';
import { createExtendedApi, mergeExtendedApi } from './extended-api.js';

describe('routes étendues du client', () => {
  it('construit chaque requête (méthode, chemin, corps) à partir d’une seule définition', async () => {
    const request = vi.fn().mockResolvedValue({ ok: true });
    const api = createExtendedApi(request);

    await api.assertions.list({ entityType: 'PERSON', entityId: 4, field: '' });
    await api.assertions.create({
      entityType: 'PERSON',
      entityId: 4,
      field: 'birth_date',
      value: '1850',
    });
    await api.assertions.accept(9);
    await api.persons.findByIdentifier('wikidata', 'Q 1');
    await api.places.resolve(3, 1950);
    await api.places.resolve(3);
    await api.unions.addPartner(2, 8);
    await api.unions.family(2);
    await api.sources.removeCitation(5);
    await api.mediaLinks.addUrl({ url: 'https://a.org', title: 't' });
    await api.graphExtras.paths(1, 2, { depth: 3, limit: 5 });
    await api.notebookExtras.history(6);

    expect(request.mock.calls).toEqual([
      ['GET', '/api/assertions?entityType=PERSON&entityId=4'],
      [
        'POST',
        '/api/assertions',
        { entityType: 'PERSON', entityId: 4, field: 'birth_date', value: '1850' },
      ],
      ['POST', '/api/assertions/9/accept', {}],
      ['GET', '/api/persons/by-identifier?scheme=wikidata&value=Q+1'],
      ['GET', '/api/places/3/resolve?year=1950'],
      ['GET', '/api/places/3/resolve'],
      ['POST', '/api/unions/2/partners', { personId: 8 }],
      ['GET', '/api/unions/2/family'],
      ['DELETE', '/api/sources/citation/5'],
      ['POST', '/api/media/url', { url: 'https://a.org', title: 't' }],
      ['GET', '/api/graph/path?personA=1&personB=2&depth=3&limit=5'],
      ['GET', '/api/notebook/6/history'],
    ]);
  });

  it('se fusionne dans le client existant sans écraser ses méthodes', () => {
    const base = {
      persons: { list: 'liste', create: 'création' },
      media: { upload: 'envoi' },
      graph: { ancestors: 'ancêtres' },
      research: { list: 'carnet' },
      dashboard: { x: 1 },
    };
    const merged = mergeExtendedApi(base, createExtendedApi(vi.fn()));
    expect(merged.persons.list).toBe('liste');
    expect(typeof merged.persons.addIdentifier).toBe('function');
    expect(merged.media.upload).toBe('envoi');
    expect(typeof merged.media.addLink).toBe('function');
    expect(typeof merged.media.addUrl).toBe('function');
    expect(merged.graph.ancestors).toBe('ancêtres');
    expect(typeof merged.graph.consistency).toBe('function');
    expect(typeof merged.graph.paths).toBe('function');
    expect(typeof merged.research.history).toBe('function');
    expect(typeof merged.assertions.conflicts).toBe('function');
    expect(base.persons.addIdentifier).toBeUndefined();
    expect(merged.dashboard).toEqual({ x: 1 });
  });
});
