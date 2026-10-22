import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { stopOcr } from '../../src/server/src/indexing/content-extract.js';
import { startTestServer, requestJson } from './helpers.js';

after(() => stopOcr());

const post = (server, path, body) => requestJson(server.baseUrl, path, { method: 'POST', body });

async function person(server, body) {
  return (await post(server, '/api/persons', { familyName: 'Dupont', ...body })).body;
}

async function birth(server, personId, dateText, placeId) {
  await post(server, '/api/events', {
    type: 'BIRTH',
    dateText,
    ...(placeId ? { placeId } : {}),
    participants: [{ personId, role: 'PRINCIPAL' }],
  });
}

test('doublons : score explicable, somme des raisons égale au score, jamais de fusion', async () => {
  const server = await startTestServer();
  try {
    const place = (await post(server, '/api/places', { name: 'Nantes' })).body;
    const a = await person(server, { givenNames: 'Jean', sex: 'M' });
    const b = await person(server, { givenNames: 'Jean', sex: 'M' });
    await birth(server, a.id, '1850', place.id);
    await birth(server, b.id, '1852', place.id);

    const { body } = await requestJson(server.baseUrl, '/api/search/duplicates');
    assert.equal(body.total, 1);
    const [pair] = body.items;
    assert.equal(pair.requiresValidation, true);
    const codes = pair.reasons.map((reason) => reason.code);
    assert.deepEqual(codes.sort(), ['BIRTH_YEAR_CLOSE', 'NAME_SIMILAR', 'SAME_BIRTH_PLACE']);
    assert.equal(
      Math.min(
        100,
        pair.reasons.reduce((sum, reason) => sum + reason.weight, 0),
      ),
      pair.score,
      'le score est exactement la somme des raisons affichées',
    );
    assert.equal(pair.reasons.find((r) => r.code === 'BIRTH_YEAR_CLOSE').detail.left, 1850);
    assert.equal(
      server.database.prepare('SELECT COUNT(*) AS n FROM persons WHERE deleted_at IS NULL').get().n,
      2,
      'détecter ne fusionne jamais',
    );
  } finally {
    await server.close();
  }
});

test('doublons : sexes incompatibles pénalisés, écart de naissance trop grand exclu', async () => {
  const server = await startTestServer();
  try {
    const a = await person(server, { givenNames: 'Claude', sex: 'M' });
    const b = await person(server, { givenNames: 'Claude', sex: 'F' });
    const c = await person(server, { givenNames: 'Claude', sex: 'M' });
    const d = await person(server, { givenNames: 'Claude', sex: 'M' });
    await birth(server, a.id, '1850');
    await birth(server, b.id, '1850');
    await birth(server, c.id, '1700');
    await birth(server, d.id, '1851');

    const { body } = await requestJson(server.baseUrl, '/api/search/duplicates');
    const pairs = body.items.map((item) =>
      item.persons
        .map((p) => p.id)
        .sort((x, y) => x - y)
        .join('-'),
    );
    assert.ok(
      pairs.includes(`${a.id}-${d.id}`),
      'même sexe, naissances proches : doublon probable',
    );
    assert.ok(!pairs.some((pair) => pair.includes(String(c.id))), 'né en 1700 : exclu');
    const mixed = body.items.find((item) => item.persons.some((p) => p.id === b.id));
    if (mixed) {
      assert.ok(mixed.reasons.some((reason) => reason.code === 'SEX_DIFFERS' && reason.weight < 0));
      const same = body.items.find(
        (item) =>
          item.persons
            .map((p) => p.id)
            .sort()
            .join('-') === `${a.id}-${d.id}`,
      );
      assert.ok(mixed.score < same.score, 'des sexes différents font baisser le score');
    }
  } finally {
    await server.close();
  }
});
