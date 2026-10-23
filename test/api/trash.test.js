import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { stopOcr } from '../../src/server/src/indexing/content-extract.js';

after(() => stopOcr());
import { startTestServer, requestJson } from './helpers.js';

async function login(server, name = 'Alice') {
  await requestJson(server.baseUrl, '/api/accounts', { method: 'POST', body: { name } });
  const { body } = await requestJson(server.baseUrl, '/api/accounts/login', {
    method: 'POST',
    body: { name },
  });
  return body.token;
}

test('GET /api/trash liste les entités supprimées de toutes les tables prises en charge', async () => {
  const server = await startTestServer();
  try {
    const { body: person } = await requestJson(server.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: 'Ada', familyName: 'Lovelace' },
    });
    await requestJson(server.baseUrl, `/api/persons/${person.id}`, { method: 'DELETE' });

    const { status, body } = await requestJson(server.baseUrl, '/api/trash');
    assert.equal(status, 200);
    assert.equal(body.length, 1);
    assert.equal(body[0].table, 'persons');
    assert.equal(body[0].id, person.id);
  } finally {
    await server.close();
  }
});

test('POST /api/trash/:table/:id/restore requiert une session', async () => {
  const server = await startTestServer();
  try {
    const { body: person } = await requestJson(server.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: 'Ada', familyName: 'Lovelace' },
    });
    await requestJson(server.baseUrl, `/api/persons/${person.id}`, { method: 'DELETE' });

    const withoutSession = await requestJson(
      server.baseUrl,
      `/api/trash/persons/${person.id}/restore`,
      { method: 'POST' },
    );
    assert.equal(withoutSession.status, 401);

    const token = await login(server);
    const withSession = await requestJson(
      server.baseUrl,
      `/api/trash/persons/${person.id}/restore`,
      { method: 'POST', headers: { 'x-geneoapp-session': token } },
    );
    assert.equal(withSession.status, 200);
    assert.equal(withSession.body.deleted_at, null);

    const trash = await requestJson(server.baseUrl, '/api/trash');
    assert.equal(trash.body.length, 0);
  } finally {
    await server.close();
  }
});

test('DELETE /api/trash/:table/:id (purge) supprime définitivement et requiert une session', async () => {
  const server = await startTestServer();
  try {
    const { body: place } = await requestJson(server.baseUrl, '/api/places', {
      method: 'POST',
      body: { name: 'Londres' },
    });
    await requestJson(server.baseUrl, `/api/places/${place.id}`, { method: 'DELETE' });

    const token = await login(server);
    const { status } = await requestJson(server.baseUrl, `/api/trash/places/${place.id}`, {
      method: 'DELETE',
      headers: { 'x-geneoapp-session': token },
    });
    assert.equal(status, 204);

    const { status: getStatus } = await requestJson(
      server.baseUrl,
      `/api/places/${place.id}?includeDeleted=true`,
    );
    assert.equal(getStatus, 404);
  } finally {
    await server.close();
  }
});

test('purge d’une table hors périmètre de la corbeille est rejetée', async () => {
  const server = await startTestServer();
  try {
    const token = await login(server);
    const { status } = await requestJson(server.baseUrl, '/api/trash/schema_migrations/1', {
      method: 'DELETE',
      headers: { 'x-geneoapp-session': token },
    });
    assert.equal(status, 400);
  } finally {
    await server.close();
  }
});
