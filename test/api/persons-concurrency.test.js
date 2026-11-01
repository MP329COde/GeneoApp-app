import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { stopOcr } from '../../src/server/src/indexing/content-extract.js';
import { startTestServer, requestJson } from './helpers.js';

after(() => stopOcr());

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function create(server) {
  const { body } = await requestJson(server.baseUrl, '/api/persons', {
    method: 'POST',
    body: { givenNames: 'Ada', familyName: 'Lovelace' },
  });
  return body;
}

const etagOf = async (server, id) =>
  (await fetch(`${server.baseUrl}/api/persons/${id}`)).headers.get('etag');

test('GET et PATCH renvoient un ETag ; sans If-Match la mise à jour reste permise', async () => {
  const server = await startTestServer();
  try {
    const person = await create(server);
    assert.match(await etagOf(server, person.id), /^"/);
    const { status, body } = await requestJson(server.baseUrl, `/api/persons/${person.id}`, {
      method: 'PATCH',
      body: { givenNames: 'Augusta' },
    });
    assert.equal(status, 200);
    assert.equal(body.given_names, 'Augusta');
  } finally {
    await server.close();
  }
});

test('édition simultanée : le second éditeur reçoit 409 EDIT_CONFLICT et rien n’est écrasé', async () => {
  const server = await startTestServer();
  try {
    const person = await create(server);
    // Deux postes ouvrent la même version.
    const stale = await etagOf(server, person.id);
    await pause(5);

    const first = await requestJson(server.baseUrl, `/api/persons/${person.id}`, {
      method: 'PATCH',
      headers: { 'if-match': stale },
      body: { givenNames: 'Augusta' },
    });
    assert.equal(first.status, 200);

    const second = await requestJson(server.baseUrl, `/api/persons/${person.id}`, {
      method: 'PATCH',
      headers: { 'if-match': stale },
      body: { givenNames: 'Autre' },
    });
    assert.equal(second.status, 409);
    assert.equal(second.body.error.code, 'EDIT_CONFLICT');
    assert.match(second.body.error.message, /modifiée par quelqu/);

    const current = await requestJson(server.baseUrl, `/api/persons/${person.id}`);
    assert.equal(current.body.given_names, 'Augusta');

    // Après rechargement (nouvel ETag), la modification passe.
    const retry = await requestJson(server.baseUrl, `/api/persons/${person.id}`, {
      method: 'PATCH',
      headers: { 'if-match': await etagOf(server, person.id) },
      body: { givenNames: 'Autre' },
    });
    assert.equal(retry.status, 200);
  } finally {
    await server.close();
  }
});

test('deux PATCH simultanés avec le même If-Match : un seul réussit', async () => {
  const server = await startTestServer();
  try {
    const person = await create(server);
    const etag = await etagOf(server, person.id);
    await pause(5);
    const results = await Promise.all(
      ['Un', 'Deux'].map((name) =>
        requestJson(server.baseUrl, `/api/persons/${person.id}`, {
          method: 'PATCH',
          headers: { 'if-match': etag },
          body: { givenNames: name },
        }),
      ),
    );
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  } finally {
    await server.close();
  }
});
