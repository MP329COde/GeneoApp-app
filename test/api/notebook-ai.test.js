import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { stopOcr } from '../../src/server/src/indexing/content-extract.js';

after(() => stopOcr());
import { startTestServer, requestJson } from './helpers.js';

test('POST/GET /api/notebook gère un carnet local et cloisonné', async () => {
  const server = await startTestServer();
  try {
    const created = await requestJson(server.baseUrl, '/api/notebook', {
      method: 'POST',
      body: { title: 'Source mairie', content: 'Vérifier l’acte de naissance du 12/04/1901.' },
    });

    assert.equal(created.status, 201);
    assert.equal(created.body.title, 'Source mairie');
    assert.ok(created.body.id);

    const listed = await requestJson(server.baseUrl, '/api/notebook');
    assert.equal(listed.status, 200);
    assert.equal(listed.body.length, 1);
    assert.equal(listed.body[0].title, 'Source mairie');
  } finally {
    await server.close();
  }
});

test('GET /api/statistics retourne les totaux locaux', async () => {
  const server = await startTestServer();
  try {
    await requestJson(server.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: 'Marie', familyName: 'Dupont' },
    });

    const response = await requestJson(server.baseUrl, '/api/statistics');
    assert.equal(response.status, 200);
    assert.ok(response.body.totals);
    assert.equal(response.body.totals.persons, 1);
    assert.ok(response.body.generatedAt);
  } finally {
    await server.close();
  }
});

test('GET /api/reports/summary renvoie un rapport synthétique', async () => {
  const server = await startTestServer();
  try {
    await requestJson(server.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: 'Jean', familyName: 'Martin' },
    });

    const response = await requestJson(server.baseUrl, '/api/reports/summary');
    assert.equal(response.status, 200);
    assert.ok(response.body.summary);
    assert.ok(response.body.summary.persons >= 1);
    assert.ok(response.body.summary.generatedAt);
  } finally {
    await server.close();
  }
});

test('POST /api/ai/analyze refuse l’IA locale lorsqu’elle est désactivée', async () => {
  const server = await startTestServer();
  try {
    const response = await requestJson(server.baseUrl, '/api/ai/analyze', {
      method: 'POST',
      body: { prompt: 'Résume la famille' },
    });

    assert.equal(response.status, 503);
    assert.equal(response.body.error.message, 'L’IA locale est désactivée');
  } finally {
    await server.close();
  }
});
