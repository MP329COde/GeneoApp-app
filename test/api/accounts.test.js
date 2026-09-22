import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startTestServer, requestJson } from './helpers.js';

test('POST /api/accounts crée un profil sans code (profil ouvert)', async () => {
  const server = await startTestServer();
  try {
    const { status, body } = await requestJson(server.baseUrl, '/api/accounts', {
      method: 'POST',
      body: { name: 'Alice' },
    });

    assert.equal(status, 201);
    assert.equal(body.name, 'Alice');
    assert.equal(body.hasPin, false);
    assert.equal(body.pin_hash, undefined);
  } finally {
    await server.close();
  }
});

test('POST /api/accounts refuse un nom déjà pris', async () => {
  const server = await startTestServer();
  try {
    await requestJson(server.baseUrl, '/api/accounts', { method: 'POST', body: { name: 'Alice' } });
    const { status } = await requestJson(server.baseUrl, '/api/accounts', {
      method: 'POST',
      body: { name: 'Alice' },
    });

    assert.equal(status, 409);
  } finally {
    await server.close();
  }
});

test('login échoue avec un code incorrect', async () => {
  const server = await startTestServer();
  try {
    await requestJson(server.baseUrl, '/api/accounts', {
      method: 'POST',
      body: { name: 'Bob', pin: '1234' },
    });

    const { status } = await requestJson(server.baseUrl, '/api/accounts/login', {
      method: 'POST',
      body: { name: 'Bob', pin: '0000' },
    });

    assert.equal(status, 401);
  } finally {
    await server.close();
  }
});

test('login réussit avec le bon code et renvoie un jeton de session', async () => {
  const server = await startTestServer();
  try {
    await requestJson(server.baseUrl, '/api/accounts', {
      method: 'POST',
      body: { name: 'Bob', pin: '1234' },
    });

    const { status, body } = await requestJson(server.baseUrl, '/api/accounts/login', {
      method: 'POST',
      body: { name: 'Bob', pin: '1234' },
    });

    assert.equal(status, 200);
    assert.ok(body.token);
    assert.equal(body.account.name, 'Bob');
  } finally {
    await server.close();
  }
});

test('login d’un profil sans code réussit sans pin', async () => {
  const server = await startTestServer();
  try {
    await requestJson(server.baseUrl, '/api/accounts', { method: 'POST', body: { name: 'Alice' } });
    const { status, body } = await requestJson(server.baseUrl, '/api/accounts/login', {
      method: 'POST',
      body: { name: 'Alice' },
    });

    assert.equal(status, 200);
    assert.ok(body.token);
  } finally {
    await server.close();
  }
});

test('DELETE /api/accounts/:id requiert une session active', async () => {
  const server = await startTestServer();
  try {
    const { body: alice } = await requestJson(server.baseUrl, '/api/accounts', {
      method: 'POST',
      body: { name: 'Alice' },
    });

    const withoutSession = await requestJson(server.baseUrl, `/api/accounts/${alice.id}`, {
      method: 'DELETE',
    });
    assert.equal(withoutSession.status, 401);

    const { body: login } = await requestJson(server.baseUrl, '/api/accounts/login', {
      method: 'POST',
      body: { name: 'Alice' },
    });

    const withSession = await requestJson(server.baseUrl, `/api/accounts/${alice.id}`, {
      method: 'DELETE',
      headers: { 'x-geneoapp-session': login.token },
    });
    assert.equal(withSession.status, 204);
  } finally {
    await server.close();
  }
});
