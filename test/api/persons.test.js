import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { stopOcr } from '../../src/server/src/indexing/content-extract.js';

after(() => stopOcr());
import { startTestServer, requestJson } from './helpers.js';

test('POST /api/persons crée une personne valide', async () => {
  const server = await startTestServer();
  try {
    const { status, body } = await requestJson(server.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: 'Ada', familyName: 'Lovelace', sex: 'F' },
    });

    assert.equal(status, 201);
    assert.equal(body.given_names, 'Ada');
    assert.equal(body.family_name, 'Lovelace');
  } finally {
    await server.close();
  }
});

test('POST /api/persons rejette un payload invalide avec 400 et le détail des champs', async () => {
  const server = await startTestServer();
  try {
    const { status, body } = await requestJson(server.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: 'Ada' },
    });

    assert.equal(status, 400);
    assert.ok(body.error.fields.familyName);
  } finally {
    await server.close();
  }
});

test('POST /api/persons rejette une valeur sex hors énumération', async () => {
  const server = await startTestServer();
  try {
    const { status, body } = await requestJson(server.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: 'Ada', familyName: 'Lovelace', sex: 'X' },
    });

    assert.equal(status, 400);
    assert.ok(body.error.fields.sex);
  } finally {
    await server.close();
  }
});

test('GET /api/persons/:id retourne 404 pour une personne inconnue', async () => {
  const server = await startTestServer();
  try {
    const { status } = await requestJson(server.baseUrl, '/api/persons/999');
    assert.equal(status, 404);
  } finally {
    await server.close();
  }
});

test('GET /api/persons/:id rejette un id non numérique avec 400', async () => {
  const server = await startTestServer();
  try {
    const { status } = await requestJson(server.baseUrl, '/api/persons/not-a-number');
    assert.equal(status, 400);
  } finally {
    await server.close();
  }
});

test('cycle complet : création, mise à jour, liste, suppression douce, restauration', async () => {
  const server = await startTestServer();
  try {
    const created = await requestJson(server.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: 'Grace', familyName: 'Hopper' },
      headers: { 'x-geneoapp-actor': 'tester' },
    });
    const id = created.body.id;

    const updated = await requestJson(server.baseUrl, `/api/persons/${id}`, {
      method: 'PATCH',
      body: { notes: 'Pionnière du COBOL' },
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.notes, 'Pionnière du COBOL');

    const list = await requestJson(server.baseUrl, '/api/persons');
    assert.equal(list.body.length, 1);

    const removed = await requestJson(server.baseUrl, `/api/persons/${id}`, { method: 'DELETE' });
    assert.equal(removed.status, 204);

    const listAfterDelete = await requestJson(server.baseUrl, '/api/persons');
    assert.equal(listAfterDelete.body.length, 0);

    const restored = await requestJson(server.baseUrl, `/api/persons/${id}/restore`, {
      method: 'POST',
    });
    assert.equal(restored.status, 200);
    assert.equal(restored.body.deleted_at, null);

    const audit = await requestJson(server.baseUrl, `/api/audit/persons/${id}`);
    const operations = audit.body.map((entry) => entry.operation);
    assert.deepEqual(operations, ['INSERT', 'UPDATE', 'DELETE', 'RESTORE']);
    assert.equal(audit.body[0].performed_by, 'tester');
  } finally {
    await server.close();
  }
});

test('PATCH /api/persons/:id sans champ modifiable retourne 400', async () => {
  const server = await startTestServer();
  try {
    const created = await requestJson(server.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: 'Grace', familyName: 'Hopper' },
    });

    const { status } = await requestJson(server.baseUrl, `/api/persons/${created.body.id}`, {
      method: 'PATCH',
      body: {},
    });

    assert.equal(status, 400);
  } finally {
    await server.close();
  }
});

test('POST /api/persons accepte et persiste l’identité étendue (alias, nom marital, titre, suffixe, vivant, id externe)', async () => {
  const server = await startTestServer();
  try {
    const { status, body } = await requestJson(server.baseUrl, '/api/persons', {
      method: 'POST',
      body: {
        givenNames: 'Ada',
        familyName: 'Lovelace',
        nickname: 'Ada',
        marriedName: 'Ada King',
        title: 'Comtesse',
        suffix: null,
        isLiving: false,
        externalId: 'GEDCOM-I1',
      },
    });

    assert.equal(status, 201);
    assert.equal(body.nickname, 'Ada');
    assert.equal(body.married_name, 'Ada King');
    assert.equal(body.title, 'Comtesse');
    assert.equal(body.is_living, 0);
    assert.equal(body.external_id, 'GEDCOM-I1');

    const updated = await requestJson(server.baseUrl, `/api/persons/${body.id}`, {
      method: 'PATCH',
      body: { isLiving: true },
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.is_living, 1);
  } finally {
    await server.close();
  }
});

test('POST /api/persons rejette un isLiving non booléen', async () => {
  const server = await startTestServer();
  try {
    const { status, body } = await requestJson(server.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: 'Ada', familyName: 'Lovelace', isLiving: 'oui' },
    });

    assert.equal(status, 400);
    assert.ok(body.error.fields.isLiving);
  } finally {
    await server.close();
  }
});
