import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startTestServer, requestJson } from './helpers.js';

test('les notes locales conservent le niveau de preuve et les contradictions', async () => {
  const server = await startTestServer();
  try {
    const person = await requestJson(server.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: 'Jean', familyName: 'Dupont' },
    });
    const created = await requestJson(server.baseUrl, '/api/notes', {
      method: 'POST',
      body: {
        entityType: 'PERSON',
        entityId: person.body.id,
        title: 'Hypothèse de naissance',
        body: 'Né peut-être à Nantes.',
        confidence: 'LOW',
        isContradiction: true,
      },
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.is_contradiction, 1);
    assert.equal(created.body.confidence, 'LOW');

    const listed = await requestJson(server.baseUrl, `/api/notes/PERSON/${person.body.id}`);
    assert.equal(listed.status, 200);
    assert.equal(listed.body.length, 1);
  } finally {
    await server.close();
  }
});

test('la recherche locale retrouve une personne par préfixe de nom', async () => {
  const server = await startTestServer();
  try {
    await requestJson(server.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: 'Jean', familyName: 'Dupont' },
    });
    const result = await requestJson(server.baseUrl, '/api/search?q=Dupon&entityTypes=PERSON');
    assert.equal(result.status, 200);
    assert.equal(result.body.length, 1);
    assert.equal(result.body[0].entity_type, 'PERSON');
  } finally {
    await server.close();
  }
});

test('la détection de doublons propose un score sans fusion automatique', async () => {
  const server = await startTestServer();
  try {
    await requestJson(server.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: 'Jean-Pierre', familyName: 'Dupont' },
    });
    await requestJson(server.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: 'Jean Pierre', familyName: 'Dupond' },
    });
    const result = await requestJson(server.baseUrl, '/api/search/duplicates');
    assert.equal(result.status, 200);
    assert.equal(result.body.length, 1);
    assert.equal(result.body[0].requiresValidation, true);
    assert.ok(result.body[0].score >= 60);
  } finally {
    await server.close();
  }
});

test('la recherche phonétique retrouve une variante de nom', async () => {
  const server = await startTestServer();
  try {
    await requestJson(server.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: 'Jean', familyName: 'Dupont' },
    });
    const result = await requestJson(server.baseUrl, '/api/search?q=Dupond&entityTypes=PERSON');
    assert.equal(result.status, 200);
    assert.equal(result.body.length, 1);
    assert.equal(result.body[0].entity_type, 'PERSON');
  } finally {
    await server.close();
  }
});
