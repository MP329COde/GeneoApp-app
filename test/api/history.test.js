import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { stopOcr } from '../../src/server/src/indexing/content-extract.js';

after(() => stopOcr());
import { startTestServer, requestJson } from './helpers.js';

test('annule puis rétablit la création d’une personne (données et recherche)', async () => {
  const server = await startTestServer();
  try {
    const created = await requestJson(server.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: 'Ada', familyName: 'Lovelace' },
    });
    assert.equal(created.status, 201);

    let status = await requestJson(server.baseUrl, '/api/history');
    assert.equal(status.body.canUndo, true);
    assert.equal(status.body.undoLabel, 'Ajout · personne');

    const undone = await requestJson(server.baseUrl, '/api/history/undo', { method: 'POST' });
    assert.equal(undone.body.undone, 'Ajout · personne');
    assert.equal(undone.body.canRedo, true);
    assert.deepEqual((await requestJson(server.baseUrl, '/api/persons')).body, []);
    const searchAfterUndo = await requestJson(server.baseUrl, '/api/search?q=Lovelace');
    assert.equal(JSON.stringify(searchAfterUndo.body).includes('Lovelace'), false);

    const redone = await requestJson(server.baseUrl, '/api/history/redo', { method: 'POST' });
    assert.equal(redone.body.redone, 'Ajout · personne');
    const persons = (await requestJson(server.baseUrl, '/api/persons')).body;
    assert.equal(persons.length, 1);
    assert.equal(persons[0].id, created.body.id, 'l’identifiant d’origine est conservé');
    const searchAfterRedo = await requestJson(server.baseUrl, '/api/search?q=Lovelace');
    assert.equal(JSON.stringify(searchAfterRedo.body).includes('Lovelace'), true);

    status = await requestJson(server.baseUrl, '/api/history');
    assert.equal(status.body.canRedo, false);
  } finally {
    await server.close();
  }
});

test('annule une modification en restaurant les anciennes valeurs', async () => {
  const server = await startTestServer();
  try {
    const { body: person } = await requestJson(server.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: 'Jean', familyName: 'Dupont' },
    });
    await requestJson(server.baseUrl, `/api/persons/${person.id}`, {
      method: 'PATCH',
      body: { familyName: 'Dupond' },
    });
    await requestJson(server.baseUrl, '/api/history/undo', { method: 'POST' });
    const { body } = await requestJson(server.baseUrl, `/api/persons/${person.id}`);
    assert.equal(body.family_name, 'Dupont');
  } finally {
    await server.close();
  }
});

test('une nouvelle action efface ce qui pouvait être rétabli', async () => {
  const server = await startTestServer();
  try {
    await requestJson(server.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: 'A', familyName: 'Un' },
    });
    await requestJson(server.baseUrl, '/api/history/undo', { method: 'POST' });
    await requestJson(server.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: 'B', familyName: 'Deux' },
    });
    const status = await requestJson(server.baseUrl, '/api/history');
    assert.equal(status.body.canRedo, false);
    assert.equal(status.body.actions.length, 1);
  } finally {
    await server.close();
  }
});

test('une requête refusée ne crée aucune action annulable', async () => {
  const server = await startTestServer();
  try {
    const refused = await requestJson(server.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: '' },
    });
    assert.equal(refused.status, 400);
    const status = await requestJson(server.baseUrl, '/api/history');
    assert.equal(status.body.canUndo, false);
    const nothing = await requestJson(server.baseUrl, '/api/history/undo', { method: 'POST' });
    assert.equal(nothing.body.undone, null);
  } finally {
    await server.close();
  }
});

test('annule une suppression de lien de parenté en le restaurant tel quel', async () => {
  const server = await startTestServer();
  try {
    const { body: child } = await requestJson(server.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: 'Paul', familyName: 'Martin' },
    });
    const { body: parent } = await requestJson(server.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: 'Jean', familyName: 'Martin', sex: 'M' },
    });
    const { body: link } = await requestJson(server.baseUrl, '/api/parentages', {
      method: 'POST',
      body: { childId: child.id, parentId: parent.id, parentRole: 'FATHER' },
    });
    await requestJson(server.baseUrl, `/api/parentages/${link.id}`, { method: 'DELETE' });
    let relations = await requestJson(server.baseUrl, `/api/persons/${child.id}/relations`);
    assert.equal(relations.body.parents.length, 0);

    await requestJson(server.baseUrl, '/api/history/undo', { method: 'POST' });
    relations = await requestJson(server.baseUrl, `/api/persons/${child.id}/relations`);
    assert.equal(relations.body.parents.length, 1);
  } finally {
    await server.close();
  }
});
