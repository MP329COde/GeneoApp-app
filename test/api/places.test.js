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
