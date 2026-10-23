import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, test } from 'node:test';
import { stopOcr } from '../../src/server/src/indexing/content-extract.js';
import { startTestServer, requestJson } from './helpers.js';

after(() => stopOcr());

async function person(baseUrl, givenNames, familyName) {
  return (
    await requestJson(baseUrl, '/api/persons', { method: 'POST', body: { givenNames, familyName } })
  ).body;
}

async function upload(baseUrl, body) {
  const png = await readFile(new URL('../fixtures/sample.png', import.meta.url));
  const response = await requestJson(baseUrl, '/api/media', {
    method: 'POST',
    body: { filename: 'acte.png', contentBase64: png.toString('base64'), ...body },
  });
  assert.equal(response.status, 201);
  return response.body;
}

test('portrait : envoi, affichage dans le réseau, retrait', async () => {
  const server = await startTestServer();
  try {
    const jean = await person(server.baseUrl, 'Jean', 'Dupont');
    const png = await readFile(new URL('../fixtures/sample.png', import.meta.url));
    const set = await requestJson(server.baseUrl, `/api/persons/${jean.id}/portrait`, {
      method: 'POST',
      body: { filename: 'jean.png', contentBase64: png.toString('base64') },
    });
    assert.equal(set.status, 200);
    assert.ok(set.body.portrait_media_id > 0);

    const network = await requestJson(server.baseUrl, `/api/persons/${jean.id}/network`);
    assert.equal(network.body.nodes[0].portrait_media_id, set.body.portrait_media_id);

    const owners = await requestJson(
      server.baseUrl,
      `/api/media/${set.body.portrait_media_id}/owners`,
    );
    assert.deepEqual(owners.body.owners.map((owner) => owner.reason).sort(), [
      'Photo de portrait',
      'Rattaché à la fiche',
    ]);

    const cleared = await requestJson(server.baseUrl, `/api/persons/${jean.id}/portrait`, {
      method: 'PUT',
      body: { mediaId: null },
    });
    assert.equal(cleared.body.portrait_media_id, null);
  } finally {
    await server.close();
  }
});

test('document ancien : déchiffrage, suggestions et rattachement', async () => {
  const server = await startTestServer();
  try {
    const pierre = await person(server.baseUrl, 'Pierre', 'Lefebvre');
    await person(server.baseUrl, 'Anne', 'Martin');
    const media = await upload(server.baseUrl, {});
    server.database
      .prepare('UPDATE media SET ocr_text = ? WHERE id = ?')
      .run('Le 3 xbre 1684 a esté baptizé Pierre Lefebvre fils de Jn Lefebvre', media.id);

    const decoded = await requestJson(server.baseUrl, `/api/media/${media.id}/decode`, {
      method: 'POST',
      body: {},
    });
    assert.equal(decoded.status, 200);
    assert.match(decoded.body.modern, /3 décembre 1684 a été baptisé Pierre Lefebvre/);
    assert.deepEqual(decoded.body.clues.years, [1684]);
    assert.equal(decoded.body.suggestions[0].id, pierre.id);

    const owners = await requestJson(server.baseUrl, `/api/media/${media.id}/owners`);
    assert.equal(owners.body.owners.length, 0);
    assert.equal(owners.body.suggestions[0].id, pierre.id);

    const linked = await requestJson(server.baseUrl, `/api/media/${media.id}/link`, {
      method: 'PUT',
      body: { entityType: 'PERSON', entityId: pierre.id },
    });
    assert.equal(linked.body.entity_id, pierre.id);
    const after = await requestJson(server.baseUrl, `/api/media/${media.id}/owners`);
    assert.equal(after.body.owners[0].id, pierre.id);
    assert.equal(after.body.suggestions.length, 0);
  } finally {
    await server.close();
  }
});

test('à qui appartient ce fichier : fichier connu retrouvé par empreinte', async () => {
  const server = await startTestServer();
  try {
    const jean = await person(server.baseUrl, 'Jean', 'Dupont');
    await upload(server.baseUrl, { entityType: 'PERSON', entityId: jean.id });
    const png = await readFile(new URL('../fixtures/sample.png', import.meta.url));
    const found = await requestJson(server.baseUrl, '/api/media/identify', {
      method: 'POST',
      body: { filename: 'copie.png', contentBase64: png.toString('base64') },
    });
    assert.equal(found.body.known, true);
    assert.equal(found.body.matches[0].owners[0].id, jean.id);

    const text = Buffer.from('Lettre de Jean Dupont à sa soeur, 1712').toString('base64');
    const unknown = await requestJson(server.baseUrl, '/api/media/identify', {
      method: 'POST',
      body: { filename: 'lettre.txt', contentBase64: text },
    });
    assert.equal(unknown.body.known, false);
    assert.equal(unknown.body.suggestions[0].id, jean.id);
    assert.deepEqual(unknown.body.clues.years, [1712]);
  } finally {
    await server.close();
  }
});
