import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { stopOcr } from '../../src/server/src/indexing/content-extract.js';

after(() => stopOcr());
import { startTestServer, requestJson } from './helpers.js';

test('POST /api/sources puis /api/sources/citations relie une citation à une personne', async () => {
  const server = await startTestServer();
  try {
    const person = await requestJson(server.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: 'Ada', familyName: 'Lovelace' },
    });

    const source = await requestJson(server.baseUrl, '/api/sources', {
      method: 'POST',
      body: { title: 'Registre paroissial' },
    });
    assert.equal(source.status, 201);

    const citation = await requestJson(server.baseUrl, '/api/sources/citations', {
      method: 'POST',
      body: {
        sourceId: source.body.id,
        entityType: 'PERSON',
        entityId: person.body.id,
        confidence: 'HIGH',
      },
    });
    assert.equal(citation.status, 201);

    const listed = await requestJson(
      server.baseUrl,
      `/api/sources/citations/PERSON/${person.body.id}`,
    );
    assert.equal(listed.body.length, 1);
    assert.equal(listed.body[0].confidence, 'HIGH');
  } finally {
    await server.close();
  }
});

test('POST /api/sources/citations retourne 404 si la source n’existe pas', async () => {
  const server = await startTestServer();
  try {
    const { status } = await requestJson(server.baseUrl, '/api/sources/citations', {
      method: 'POST',
      body: { sourceId: 999, entityType: 'PERSON', entityId: 1 },
    });

    assert.equal(status, 404);
  } finally {
    await server.close();
  }
});

test('POST /api/sources rejette entityType invalide sur une citation', async () => {
  const server = await startTestServer();
  try {
    const source = await requestJson(server.baseUrl, '/api/sources', {
      method: 'POST',
      body: { title: 'Registre paroissial' },
    });

    const { status } = await requestJson(server.baseUrl, '/api/sources/citations', {
      method: 'POST',
      body: { sourceId: source.body.id, entityType: 'ANIMAL', entityId: 1 },
    });

    assert.equal(status, 400);
  } finally {
    await server.close();
  }
});
