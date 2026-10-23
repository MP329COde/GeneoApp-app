import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { stopOcr } from '../../src/server/src/indexing/content-extract.js';

after(() => stopOcr());
import { startTestServer, requestJson } from './helpers.js';

test('POST /api/places crée un lieu et rejette les doublons', async () => {
  const server = await startTestServer();
  try {
    const first = await requestJson(server.baseUrl, '/api/places', {
      method: 'POST',
      body: { name: 'Paris' },
    });
    assert.equal(first.status, 201);

    const duplicate = await requestJson(server.baseUrl, '/api/places', {
      method: 'POST',
      body: { name: 'paris' },
    });
    assert.equal(duplicate.status, 409);
  } finally {
    await server.close();
  }
});

test('POST /api/places rejette une latitude non numérique', async () => {
  const server = await startTestServer();
  try {
    const { status, body } = await requestJson(server.baseUrl, '/api/places', {
      method: 'POST',
      body: { name: 'Lyon', latitude: 'nord' },
    });

    assert.equal(status, 400);
    assert.ok(body.error.fields.latitude);
  } finally {
    await server.close();
  }
});

test('placement automatique : aperçu distingue correspondance unique, homonymes et absence', async () => {
  const server = await startTestServer();
  try {
    await requestJson(server.baseUrl, '/api/places', { method: 'POST', body: { name: 'Lyon' } });
    await requestJson(server.baseUrl, '/api/places', {
      method: 'POST',
      body: { name: 'Saint-Rémy' },
    });
    await requestJson(server.baseUrl, '/api/places', {
      method: 'POST',
      body: { name: 'Lieu Totalement Inventé Xyzzy' },
    });
    // Déjà localisé : ne doit pas apparaître dans l'aperçu.
    await requestJson(server.baseUrl, '/api/places', {
      method: 'POST',
      body: { name: 'Marseille', latitude: 43.3, longitude: 5.4 },
    });

    const { status, body } = await requestJson(server.baseUrl, '/api/places/auto-locate/preview');
    assert.equal(status, 200);
    assert.equal(body.length, 3);

    const lyon = body.find((entry) => entry.name === 'Lyon');
    assert.equal(lyon.status, 'unique');
    assert.equal(lyon.matches.length, 1);
    assert.equal(lyon.matches[0].codeDepartement, '69');

    const saintRemy = body.find((entry) => entry.name === 'Saint-Rémy');
    assert.equal(saintRemy.status, 'ambiguous');
    assert.ok(saintRemy.matches.length > 1);

    const inconnu = body.find((entry) => entry.name === 'Lieu Totalement Inventé Xyzzy');
    assert.equal(inconnu.status, 'none');
    assert.deepEqual(inconnu.matches, []);
  } finally {
    await server.close();
  }
});

test('placement automatique : application requiert une confirmation explicite (code choisi)', async () => {
  const server = await startTestServer();
  try {
    const created = await requestJson(server.baseUrl, '/api/places', {
      method: 'POST',
      body: { name: 'Lyon' },
    });

    const rejected = await requestJson(server.baseUrl, '/api/places/auto-locate/apply', {
      method: 'POST',
      body: { assignments: [{ placeId: created.body.id, code: '99999' }] },
    });
    assert.equal(rejected.status, 400, 'un code ne correspondant pas au nom du lieu est refusé');

    const applied = await requestJson(server.baseUrl, '/api/places/auto-locate/apply', {
      method: 'POST',
      body: { assignments: [{ placeId: created.body.id, code: '69123' }] },
    });
    assert.equal(applied.status, 200);
    assert.equal(applied.body.updated.length, 1);
    assert.ok(Math.abs(applied.body.updated[0].latitude - 45.75) < 1);

    const preview = await requestJson(server.baseUrl, '/api/places/auto-locate/preview');
    assert.equal(
      preview.body.some((entry) => entry.placeId === created.body.id),
      false,
      'un lieu désormais localisé sort de l’aperçu',
    );
  } finally {
    await server.close();
  }
});
