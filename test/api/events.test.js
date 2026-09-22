import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startTestServer, requestJson } from './helpers.js';

async function createPerson(baseUrl, given, family) {
  const { body } = await requestJson(baseUrl, '/api/persons', {
    method: 'POST',
    body: { givenNames: given, familyName: family },
  });
  return body.id;
}

test('POST /api/events crée un événement avec ses participants', async () => {
  const server = await startTestServer();
  try {
    const personId = await createPerson(server.baseUrl, 'Ada', 'Lovelace');

    const { status, body } = await requestJson(server.baseUrl, '/api/events', {
      method: 'POST',
      body: {
        type: 'BIRTH',
        dateText: '1815-12-10',
        datePrecision: 'EXACT',
        participants: [{ personId, role: 'PRINCIPAL' }],
      },
    });

    assert.equal(status, 201);
    assert.equal(body.type, 'BIRTH');
    assert.equal(body.participants.length, 1);
    assert.equal(body.participants[0].role, 'PRINCIPAL');
  } finally {
    await server.close();
  }
});

test('POST /api/events rejette un type inconnu', async () => {
  const server = await startTestServer();
  try {
    const { status, body } = await requestJson(server.baseUrl, '/api/events', {
      method: 'POST',
      body: { type: 'UNKNOWN_TYPE' },
    });

    assert.equal(status, 400);
    assert.ok(body.error.fields.type);
  } finally {
    await server.close();
  }
});

test('POST /api/events rejette un participant sans role valide', async () => {
  const server = await startTestServer();
  try {
    const personId = await createPerson(server.baseUrl, 'Ada', 'Lovelace');

    const { status } = await requestJson(server.baseUrl, '/api/events', {
      method: 'POST',
      body: { type: 'BIRTH', participants: [{ personId, role: 'MAYOR' }] },
    });

    assert.equal(status, 400);
  } finally {
    await server.close();
  }
});

test('GET /api/events/by-person/:personId retourne les événements liés', async () => {
  const server = await startTestServer();
  try {
    const personId = await createPerson(server.baseUrl, 'Ada', 'Lovelace');
    await requestJson(server.baseUrl, '/api/events', {
      method: 'POST',
      body: { type: 'BIRTH', participants: [{ personId, role: 'PRINCIPAL' }] },
    });

    const { status, body } = await requestJson(server.baseUrl, `/api/events/by-person/${personId}`);

    assert.equal(status, 200);
    assert.equal(body.length, 1);
  } finally {
    await server.close();
  }
});

test('POST /api/events/:id/participants ajoute un participant à un événement existant', async () => {
  const server = await startTestServer();
  try {
    const witness = await createPerson(server.baseUrl, 'Charles', 'Babbage');
    const principal = await createPerson(server.baseUrl, 'Ada', 'Lovelace');
    const event = await requestJson(server.baseUrl, '/api/events', {
      method: 'POST',
      body: { type: 'MARRIAGE', participants: [{ personId: principal, role: 'PRINCIPAL' }] },
    });

    const { status } = await requestJson(
      server.baseUrl,
      `/api/events/${event.body.id}/participants`,
      {
        method: 'POST',
        body: { personId: witness, role: 'WITNESS' },
      },
    );

    assert.equal(status, 201);
  } finally {
    await server.close();
  }
});

test('POST /api/events/:id/participants retourne 404 pour un événement inconnu', async () => {
  const server = await startTestServer();
  try {
    const personId = await createPerson(server.baseUrl, 'Ada', 'Lovelace');
    const { status } = await requestJson(server.baseUrl, '/api/events/999/participants', {
      method: 'POST',
      body: { personId, role: 'WITNESS' },
    });

    assert.equal(status, 404);
  } finally {
    await server.close();
  }
});
