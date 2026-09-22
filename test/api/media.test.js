import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readdir } from 'node:fs/promises';
import { startTestServer, requestJson } from './helpers.js';

const PNG_BASE64 = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
]).toString('base64');

test('POST /api/media téléverse un fichier lié à une source, puis le télécharge à l’identique', async () => {
  const server = await startTestServer();
  try {
    const source = await requestJson(server.baseUrl, '/api/sources', {
      method: 'POST',
      body: { title: 'Registre paroissial 1815' },
    });

    const upload = await requestJson(server.baseUrl, '/api/media', {
      method: 'POST',
      body: {
        filename: 'scan-registre.png',
        contentBase64: PNG_BASE64,
        sourceId: source.body.id,
      },
    });
    assert.equal(upload.status, 201);
    assert.equal(upload.body.mime_type, 'image/png');
    assert.equal(upload.body.original_filename, 'scan-registre.png');
    assert.notEqual(upload.body.stored_filename, 'scan-registre.png');

    const listed = await requestJson(server.baseUrl, `/api/media/by-source/${source.body.id}`);
    assert.equal(listed.body.length, 1);
    assert.equal(listed.body[0].id, upload.body.id);

    const download = await fetch(`${server.baseUrl}/api/media/${upload.body.id}/content`);
    assert.equal(download.status, 200);
    assert.equal(download.headers.get('content-type'), 'image/png');
    const bytes = Buffer.from(await download.arrayBuffer());
    assert.ok(bytes.equals(Buffer.from(PNG_BASE64, 'base64')));

    const filesOnDisk = await readdir(server.mediaRoot);
    assert.deepEqual(filesOnDisk, [upload.body.stored_filename]);
  } finally {
    await server.close();
  }
});

test('POST /api/media rejette un contenu dont le type réel ne correspond à aucun format accepté (MIME falsifié)', async () => {
  const server = await startTestServer();
  try {
    const fakeContent = Buffer.from('#!/bin/sh\necho pas une image\n').toString('base64');

    const { status, body } = await requestJson(server.baseUrl, '/api/media', {
      method: 'POST',
      body: { filename: 'photo.png', contentBase64: fakeContent },
    });

    assert.equal(status, 415);
    assert.match(body.error.message, /non reconnu|non autorisé/);
  } finally {
    await server.close();
  }
});

test('POST /api/media ignore le nom de fichier fourni pour le stockage sur disque (anti path traversal)', async () => {
  const server = await startTestServer();
  try {
    const { status, body } = await requestJson(server.baseUrl, '/api/media', {
      method: 'POST',
      body: { filename: '../../../etc/passwd', contentBase64: PNG_BASE64 },
    });

    assert.equal(status, 201);
    assert.equal(body.original_filename, '../../../etc/passwd');
    assert.doesNotMatch(body.stored_filename, /\.\.|\//);

    const filesOnDisk = await readdir(server.mediaRoot);
    assert.deepEqual(filesOnDisk, [body.stored_filename]);
  } finally {
    await server.close();
  }
});

test('POST /api/media retourne 404 si la source liée n’existe pas', async () => {
  const server = await startTestServer();
  try {
    const { status } = await requestJson(server.baseUrl, '/api/media', {
      method: 'POST',
      body: { filename: 'scan.png', contentBase64: PNG_BASE64, sourceId: 999 },
    });

    assert.equal(status, 404);
  } finally {
    await server.close();
  }
});

test('POST /api/media rejette une charge sans contenu ou avec entityType sans entityId', async () => {
  const server = await startTestServer();
  try {
    const missingContent = await requestJson(server.baseUrl, '/api/media', {
      method: 'POST',
      body: { filename: 'scan.png' },
    });
    assert.equal(missingContent.status, 400);

    const orphanEntityType = await requestJson(server.baseUrl, '/api/media', {
      method: 'POST',
      body: { filename: 'scan.png', contentBase64: PNG_BASE64, entityType: 'PERSON' },
    });
    assert.equal(orphanEntityType.status, 400);
  } finally {
    await server.close();
  }
});

test('DELETE /api/media/:id supprime la ligne mais conserve le fichier comme preuve', async () => {
  const server = await startTestServer();
  try {
    const upload = await requestJson(server.baseUrl, '/api/media', {
      method: 'POST',
      body: { filename: 'scan.png', contentBase64: PNG_BASE64 },
    });

    const remove = await fetch(`${server.baseUrl}/api/media/${upload.body.id}`, {
      method: 'DELETE',
    });
    assert.equal(remove.status, 204);

    const afterDelete = await requestJson(server.baseUrl, `/api/media/${upload.body.id}`);
    assert.equal(afterDelete.status, 404);

    const filesOnDisk = await readdir(server.mediaRoot);
    assert.deepEqual(filesOnDisk, [upload.body.stored_filename]);
  } finally {
    await server.close();
  }
});
