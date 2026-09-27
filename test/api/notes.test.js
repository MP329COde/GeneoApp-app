import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { stopOcr } from '../../src/server/src/indexing/content-extract.js';

after(() => stopOcr());
import { startTestServer, requestJson } from './helpers.js';

test('les notes locales conservent le niveau de preuve et les contradictions', async () => {
  const server = await startTestServer();
  try {
    const person = await requestJson(server.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: 'Jean', familyName: 'Dupont' },
    });
    const created = await requestJson(server.baseUrl, '/api/notes', {
      method: 'POST',
      body: {
        entityType: 'PERSON',
        entityId: person.body.id,
        title: 'Hypothèse de naissance',
        body: 'Né peut-être à Nantes.',
        confidence: 'LOW',
        isContradiction: true,
      },
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.is_contradiction, 1);
    assert.equal(created.body.confidence, 'LOW');

    const listed = await requestJson(server.baseUrl, `/api/notes/PERSON/${person.body.id}`);
    assert.equal(listed.status, 200);
    assert.equal(listed.body.length, 1);
  } finally {
    await server.close();
  }
});

test('la recherche locale retrouve une personne par préfixe de nom', async () => {
  const server = await startTestServer();
  try {
    await requestJson(server.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: 'Jean', familyName: 'Dupont' },
    });
    const result = await requestJson(server.baseUrl, '/api/search?q=Dupon&entityTypes=PERSON');
    assert.equal(result.status, 200);
    assert.equal(result.body.length, 1);
    assert.equal(result.body[0].entity_type, 'PERSON');
  } finally {
    await server.close();
  }
});

test('la détection de doublons propose un score sans fusion automatique', async () => {
  const server = await startTestServer();
  try {
    await requestJson(server.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: 'Jean-Pierre', familyName: 'Dupont' },
    });
    await requestJson(server.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: 'Jean Pierre', familyName: 'Dupond' },
    });
    const result = await requestJson(server.baseUrl, '/api/search/duplicates');
    assert.equal(result.status, 200);
    assert.equal(result.body.total, 1);
    assert.equal(result.body.items.length, 1);
    assert.equal(result.body.items[0].requiresValidation, true);
    assert.ok(result.body.items[0].score >= 60);
  } finally {
    await server.close();
  }
});

// Avant correctif : l'API tronquait à `limit` (défaut 100) sans renvoyer le
// total réel, donc « 100 doublon(s) » s'affichait même quand des milliers de
// paires avaient été détectées.
test('le nombre total de doublons détectés est distinct du nombre affiché (troncature à `limit`)', async () => {
  const server = await startTestServer();
  try {
    // 4 variantes du même nom : C(4,2) = 6 paires, toutes détectées comme
    // doublons possibles.
    for (const givenNames of ['Jean-Pierre', 'Jean Pierre', 'Jean-Pierre', 'Jean-Pierres']) {
      await requestJson(server.baseUrl, '/api/persons', {
        method: 'POST',
        body: { givenNames, familyName: 'Dupont' },
      });
    }

    const truncated = await requestJson(server.baseUrl, '/api/search/duplicates?limit=2');
    assert.equal(truncated.status, 200);
    assert.equal(truncated.body.items.length, 2);
    assert.ok(
      truncated.body.total > truncated.body.items.length,
      `total (${truncated.body.total}) doit dépasser le nombre affiché (${truncated.body.items.length})`,
    );

    const untruncated = await requestJson(server.baseUrl, '/api/search/duplicates?limit=100');
    assert.equal(untruncated.body.total, untruncated.body.items.length);
  } finally {
    await server.close();
  }
});

test('la recherche phonétique retrouve une variante de nom', async () => {
  const server = await startTestServer();
  try {
    await requestJson(server.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: 'Jean', familyName: 'Dupont' },
    });
    const result = await requestJson(server.baseUrl, '/api/search?q=Dupond&entityTypes=PERSON');
    assert.equal(result.status, 200);
    assert.equal(result.body.length, 1);
    assert.equal(result.body[0].entity_type, 'PERSON');
  } finally {
    await server.close();
  }
});

test('modifie, recherche et supprime (logiquement, annulable) des annotations de toute cible', async () => {
  const server = await startTestServer();
  try {
    const create = async (body) =>
      (await requestJson(server.baseUrl, '/api/notes', { method: 'POST', body })).body;
    const lieu = await create({
      entityType: 'PLACE',
      entityId: 1,
      body: 'Commune fusionnée en 1973',
    });
    await create({
      entityType: 'TREE',
      entityId: 1,
      body: 'Branche **maternelle** à vérifier',
      isContradiction: true,
    });
    await create({ entityType: 'SEARCH', entityId: 2, body: 'Piste 100%_sûre' });

    const updated = await requestJson(server.baseUrl, `/api/notes/by-id/${lieu.id}`, {
      method: 'PATCH',
      body: { title: 'Toponymie', confidence: 'HIGH' },
    });
    assert.equal(updated.body.title, 'Toponymie');
    assert.equal(updated.body.confidence, 'HIGH');

    const byText = await requestJson(server.baseUrl, '/api/notes?q=maternelle');
    assert.deepEqual(
      byText.body.map((note) => note.entity_type),
      ['TREE'],
    );
    const literal = await requestJson(
      server.baseUrl,
      `/api/notes?q=${encodeURIComponent('100%_')}`,
    );
    assert.equal(literal.body.length, 1, '% et _ sont cherchés littéralement');
    const contradictions = await requestJson(server.baseUrl, '/api/notes?contradictionsOnly=true');
    assert.equal(contradictions.body.length, 1);
    const places = await requestJson(server.baseUrl, '/api/notes?entityType=PLACE');
    assert.equal(places.body.length, 1);

    await requestJson(server.baseUrl, `/api/notes/by-id/${lieu.id}`, { method: 'DELETE' });
    assert.equal((await requestJson(server.baseUrl, '/api/notes')).body.length, 2);
    await requestJson(server.baseUrl, '/api/history/undo', { method: 'POST' });
    assert.equal((await requestJson(server.baseUrl, '/api/notes')).body.length, 3);

    const invalid = await requestJson(server.baseUrl, `/api/notes/by-id/${lieu.id}`, {
      method: 'PATCH',
      body: { body: '   ' },
    });
    assert.equal(invalid.status, 400);
    assert.equal((await requestJson(server.baseUrl, '/api/notes?entityType=HACK')).status, 400);
  } finally {
    await server.close();
  }
});
