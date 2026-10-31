import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { stopOcr } from '../../src/server/src/indexing/content-extract.js';
import { startTestServer, requestJson } from './helpers.js';

after(() => stopOcr());

test('GET /api/statistics/insights sur un arbre vide : zéros, aucune division par zéro', async () => {
  const server = await startTestServer();
  try {
    const response = await requestJson(server.baseUrl, '/api/statistics/insights');
    assert.equal(response.status, 200);
    const { insights } = response.body;
    assert.equal(insights.persons.total, 0);
    assert.deepEqual(insights.birthsByDecade, []);
    assert.equal(insights.birthSpan, null);
    assert.equal(insights.generations.count, 0);
    assert.equal(insights.completeness.score, 0);
    assert.equal(insights.evidence.facts, 0);
  } finally {
    await server.close();
  }
});

test('GET /api/statistics/insights calcule sexe, décennies, générations, lieux et sources', async () => {
  const server = await startTestServer();
  const call = (path, body) => requestJson(server.baseUrl, path, { method: 'POST', body });
  try {
    const person = async (givenNames, familyName, sex) =>
      (await call('/api/persons', { givenNames, familyName, sex })).body;
    const grandpa = await person('Jean Paul', 'Dupont', 'M');
    const dad = await person('Pierre', 'Dupont', 'M');
    const kid = await person('Marie', 'Martin', 'F');
    await person('Inconnu', 'Dupont', 'U');
    await call('/api/parentages', { childId: dad.id, parentId: grandpa.id });
    await call('/api/parentages', { childId: kid.id, parentId: dad.id });

    const nantes = (await call('/api/places', { name: 'Nantes' })).body;
    const birth = async (personId, dateText, placeId) =>
      (
        await call('/api/events', {
          type: 'BIRTH',
          dateText,
          ...(placeId ? { placeId } : {}),
          participants: [{ personId, role: 'PRINCIPAL' }],
        })
      ).body;
    const grandBirth = await birth(grandpa.id, '12 mars 1812', nantes.id);
    await birth(dad.id, 'vers 1845', nantes.id);
    await birth(kid.id, '1871');
    const source = (await call('/api/sources', { title: 'Registre' })).body;
    await call('/api/sources/citations', {
      sourceId: source.id,
      entityType: 'EVENT',
      entityId: grandBirth.id,
    });
    await call('/api/sources', { title: 'Jamais citée' });

    const { insights } = (await requestJson(server.baseUrl, '/api/statistics/insights')).body;
    assert.deepEqual(insights.persons.bySex, { M: 2, F: 1, U: 1 });
    assert.equal(insights.persons.total, 4);
    assert.deepEqual(
      insights.birthsByDecade.map((row) => [row.decade, row.count]),
      [
        [1810, 1],
        [1820, 0],
        [1830, 0],
        [1840, 1],
        [1850, 0],
        [1860, 0],
        [1870, 1],
      ],
    );
    assert.deepEqual(insights.birthSpan, { from: 1812, to: 1871 });
    assert.equal(insights.generations.count, 3);
    assert.deepEqual(insights.generations.perGeneration, [2, 1, 1]);
    assert.deepEqual(insights.topPlaces, [{ name: 'Nantes', count: 2 }]);
    assert.deepEqual(insights.topSurnames[0], { name: 'Dupont', count: 3 });
    assert.equal(insights.topGivenNames.find((row) => row.name === 'Jean').count, 1);
    assert.deepEqual(insights.completeness.birthDate, { have: 3, total: 4, percent: 75 });
    assert.equal(insights.completeness.birthPlace.have, 2);
    assert.equal(insights.completeness.parents.have, 2);
    assert.equal(insights.completeness.sourced.have, 1);
    assert.deepEqual(insights.evidence, { facts: 3, factsCited: 1, sources: 2, sourcesUsed: 1 });
  } finally {
    await server.close();
  }
});
