import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startTestServer, requestJson } from './helpers.js';

const PNG_BASE64 = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
]).toString('base64');

test('GET /api/search retrouve une source par son titre', async () => {
  const server = await startTestServer();
  try {
    await requestJson(server.baseUrl, '/api/sources', {
      method: 'POST',
      body: { title: 'Registre paroissial de Sainte-Anne 1815' },
    });
    await requestJson(server.baseUrl, '/api/sources', {
      method: 'POST',
      body: { title: 'Acte de naissance non lié' },
    });

    const { status, body } = await requestJson(
      server.baseUrl,
      `/api/search?${new URLSearchParams({ q: 'paroissial', entityTypes: 'SOURCE' })}`,
    );

    assert.equal(status, 200);
    assert.equal(body.length, 1);
    assert.equal(body[0].entity_type, 'SOURCE');
    assert.match(body[0].title, /paroissial/);
  } finally {
    await server.close();
  }
});

test('GET /api/search retrouve un média par son nom de fichier original', async () => {
  const server = await startTestServer();
  try {
    const upload = await requestJson(server.baseUrl, '/api/media', {
      method: 'POST',
      body: { filename: 'acte-mariage-lovelace.png', contentBase64: PNG_BASE64 },
    });

    const { status, body } = await requestJson(
      server.baseUrl,
      `/api/search?${new URLSearchParams({ q: 'lovelace' })}`,
    );

    assert.equal(status, 200);
    assert.equal(body.length, 1);
    assert.equal(body[0].entity_type, 'MEDIA');
    assert.equal(body[0].entity_id, upload.body.id);
  } finally {
    await server.close();
  }
});

test('GET /api/search exige un paramètre q non vide', async () => {
  const server = await startTestServer();
  try {
    const { status } = await requestJson(server.baseUrl, '/api/search');
    assert.equal(status, 400);
  } finally {
    await server.close();
  }
});

test('GET /api/search rejette un entityTypes inconnu', async () => {
  const server = await startTestServer();
  try {
    const { status } = await requestJson(
      server.baseUrl,
      `/api/search?${new URLSearchParams({ q: 'test', entityTypes: 'ANIMAL' })}`,
    );
    assert.equal(status, 400);
  } finally {
    await server.close();
  }
});
