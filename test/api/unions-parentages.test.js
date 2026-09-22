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

test('POST /api/unions crée une union avec au moins deux partenaires', async () => {
  const server = await startTestServer();
  try {
    const a = await createPerson(server.baseUrl, 'Ada', 'Lovelace');
    const b = await createPerson(server.baseUrl, 'William', 'King');

    const { status, body } = await requestJson(server.baseUrl, '/api/unions', {
      method: 'POST',
      body: { type: 'MARRIAGE', partnerIds: [a, b] },
    });

    assert.equal(status, 201);
    assert.deepEqual(body.partnerIds.sort(), [a, b].sort());
  } finally {
    await server.close();
  }
});

test('POST /api/unions rejette une union avec un seul partenaire', async () => {
  const server = await startTestServer();
  try {
    const a = await createPerson(server.baseUrl, 'Ada', 'Lovelace');

    const { status, body } = await requestJson(server.baseUrl, '/api/unions', {
      method: 'POST',
      body: { partnerIds: [a] },
    });

    assert.equal(status, 400);
    assert.ok(body.error.fields.partnerIds);
  } finally {
    await server.close();
  }
});

test('POST /api/parentages crée une filiation et la retrouve par enfant/parent', async () => {
  const server = await startTestServer();
  try {
    const child = await createPerson(server.baseUrl, 'Ada', 'Lovelace');
    const parent = await createPerson(server.baseUrl, 'Anne', 'Byron');

    const created = await requestJson(server.baseUrl, '/api/parentages', {
      method: 'POST',
      body: { childId: child, parentId: parent, parentRole: 'MOTHER' },
    });
    assert.equal(created.status, 201);

    const parentsOf = await requestJson(server.baseUrl, `/api/parentages/parents-of/${child}`);
    assert.equal(parentsOf.body.length, 1);

    const childrenOf = await requestJson(server.baseUrl, `/api/parentages/children-of/${parent}`);
    assert.equal(childrenOf.body.length, 1);
  } finally {
    await server.close();
  }
});

test('POST /api/parentages rejette une personne comme son propre parent', async () => {
  const server = await startTestServer();
  try {
    const person = await createPerson(server.baseUrl, 'Ada', 'Lovelace');

    const { status, body } = await requestJson(server.baseUrl, '/api/parentages', {
      method: 'POST',
      body: { childId: person, parentId: person },
    });

    assert.equal(status, 400);
    assert.ok(body.error.fields.parentId);
  } finally {
    await server.close();
  }
});
