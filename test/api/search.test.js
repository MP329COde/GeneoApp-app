import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { stopOcr } from '../../src/server/src/indexing/content-extract.js';

after(() => stopOcr());
import { startTestServer, requestJson } from './helpers.js';

const PNG_BASE64 = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
]).toString('base64');

test('GET /api/search retrouve une source par son titre', async () => {
  const server = await startTestServer();
  try {
    await requestJson(server.baseUrl, '/api/sources', {
      method: 'POST',
      body: { title: 'Registre paroissial de Sainte-Anne 1815' },
    });
    await requestJson(server.baseUrl, '/api/sources', {
      method: 'POST',
      body: { title: 'Acte de naissance non lié' },
    });

    const { status, body } = await requestJson(
      server.baseUrl,
      `/api/search?${new URLSearchParams({ q: 'paroissial', entityTypes: 'SOURCE' })}`,
    );

    assert.equal(status, 200);
    assert.equal(body.length, 1);
    assert.equal(body[0].entity_type, 'SOURCE');
    assert.match(body[0].title, /paroissial/);
  } finally {
    await server.close();
  }
});

test('GET /api/search retrouve un média par son nom de fichier original', async () => {
  const server = await startTestServer();
  try {
    const upload = await requestJson(server.baseUrl, '/api/media', {
      method: 'POST',
      body: { filename: 'acte-mariage-lovelace.png', contentBase64: PNG_BASE64 },
    });

    const { status, body } = await requestJson(
      server.baseUrl,
      `/api/search?${new URLSearchParams({ q: 'lovelace' })}`,
    );

    assert.equal(status, 200);
    assert.equal(body.length, 1);
    assert.equal(body[0].entity_type, 'MEDIA');
    assert.equal(body[0].entity_id, upload.body.id);
  } finally {
    await server.close();
  }
});

test('GET /api/search exige un paramètre q non vide', async () => {
  const server = await startTestServer();
  try {
    const { status } = await requestJson(server.baseUrl, '/api/search');
    assert.equal(status, 400);
  } finally {
    await server.close();
  }
});

test('GET /api/search rejette un entityTypes inconnu', async () => {
  const server = await startTestServer();
  try {
    const { status } = await requestJson(
      server.baseUrl,
      `/api/search?${new URLSearchParams({ q: 'test', entityTypes: 'ANIMAL' })}`,
    );
    assert.equal(status, 400);
  } finally {
    await server.close();
  }
});

test('POST /api/search/merge réattribue les données réelles du doublon puis le supprime en douceur', async () => {
  const server = await startTestServer();
  try {
    const survivor = await requestJson(server.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: 'Ada', familyName: 'Lovelace' },
    });
    const duplicate = await requestJson(server.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: 'Ada', familyName: 'Lovelace' },
    });
    const child = await requestJson(server.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: 'Byron', familyName: 'Lovelace' },
    });
    const partner = await requestJson(server.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: 'William', familyName: 'King' },
    });

    // Le doublon porte la filiation réelle, une union et une note ; le
    // survivant n'en porte aucune avant la fusion.
    await requestJson(server.baseUrl, '/api/parentages', {
      method: 'POST',
      body: { childId: child.body.id, parentId: duplicate.body.id, parentRole: 'MOTHER' },
    });
    await requestJson(server.baseUrl, '/api/unions', {
      method: 'POST',
      body: { type: 'MARRIAGE', partnerIds: [duplicate.body.id, partner.body.id] },
    });
    await requestJson(server.baseUrl, '/api/notes', {
      method: 'POST',
      body: {
        entityType: 'PERSON',
        entityId: duplicate.body.id,
        body: 'Note réelle sur le doublon',
      },
    });

    const { status, body } = await requestJson(server.baseUrl, '/api/search/merge', {
      method: 'POST',
      body: { survivorId: survivor.body.id, duplicateId: duplicate.body.id },
    });

    assert.equal(status, 200);
    assert.equal(body.id, survivor.body.id);

    const parentsOfChild = await requestJson(
      server.baseUrl,
      `/api/parentages/parents-of/${child.body.id}`,
    );
    assert.deepEqual(
      parentsOfChild.body.map((p) => p.parent_id),
      [survivor.body.id],
    );

    const unions = await requestJson(server.baseUrl, `/api/unions/by-person/${survivor.body.id}`);
    assert.equal(unions.body.length, 1);

    const notes = await requestJson(server.baseUrl, `/api/notes/PERSON/${survivor.body.id}`);
    assert.equal(notes.body.length, 1);
    assert.equal(notes.body[0].body, 'Note réelle sur le doublon');

    const removed = await requestJson(server.baseUrl, `/api/persons/${duplicate.body.id}`);
    assert.equal(removed.status, 404);
  } finally {
    await server.close();
  }
});

test('POST /api/search/merge supprime un lien du doublon plutôt que de créer un doublon de filiation', async () => {
  const server = await startTestServer();
  try {
    const survivor = await requestJson(server.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: 'Ada', familyName: 'Lovelace' },
    });
    const duplicate = await requestJson(server.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: 'Ada', familyName: 'Lovelace' },
    });
    const child = await requestJson(server.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: 'Byron', familyName: 'Lovelace' },
    });

    // Le même enfant est déjà relié aux deux fiches en doublon : la fusion ne
    // doit pas violer la contrainte d'unicité (child_id, parent_id).
    await requestJson(server.baseUrl, '/api/parentages', {
      method: 'POST',
      body: { childId: child.body.id, parentId: survivor.body.id, parentRole: 'MOTHER' },
    });
    await requestJson(server.baseUrl, '/api/parentages', {
      method: 'POST',
      body: { childId: child.body.id, parentId: duplicate.body.id, parentRole: 'MOTHER' },
    });

    const { status } = await requestJson(server.baseUrl, '/api/search/merge', {
      method: 'POST',
      body: { survivorId: survivor.body.id, duplicateId: duplicate.body.id },
    });
    assert.equal(status, 200);

    const parentsOfChild = await requestJson(
      server.baseUrl,
      `/api/parentages/parents-of/${child.body.id}`,
    );
    assert.deepEqual(
      parentsOfChild.body.map((p) => p.parent_id),
      [survivor.body.id],
    );
  } finally {
    await server.close();
  }
});

test('POST /api/search/merge rejette un survivorId identique au duplicateId', async () => {
  const server = await startTestServer();
  try {
    const person = await requestJson(server.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: 'Ada', familyName: 'Lovelace' },
    });

    const { status } = await requestJson(server.baseUrl, '/api/search/merge', {
      method: 'POST',
      body: { survivorId: person.body.id, duplicateId: person.body.id },
    });
    assert.equal(status, 400);
  } finally {
    await server.close();
  }
});

test('GET /api/search/merge/preview décrit les réattributions réelles avant fusion', async () => {
  const server = await startTestServer();
  try {
    const survivor = await requestJson(server.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: 'Ada', familyName: 'Lovelace' },
    });
    const duplicate = await requestJson(server.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: 'Ada', familyName: 'Lovelace' },
    });
    const child = await requestJson(server.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: 'Byron', familyName: 'Lovelace' },
    });
    await requestJson(server.baseUrl, '/api/parentages', {
      method: 'POST',
      body: { childId: child.body.id, parentId: duplicate.body.id, parentRole: 'MOTHER' },
    });
    await requestJson(server.baseUrl, '/api/notes', {
      method: 'POST',
      body: { entityType: 'PERSON', entityId: duplicate.body.id, body: 'Note réelle' },
    });

    const { status, body } = await requestJson(
      server.baseUrl,
      `/api/search/merge/preview?${new URLSearchParams({
        survivorId: survivor.body.id,
        duplicateId: duplicate.body.id,
      })}`,
    );

    assert.equal(status, 200);
    assert.equal(body.survivor.id, survivor.body.id);
    assert.equal(body.duplicate.id, duplicate.body.id);
    assert.equal(body.reassignments.parentagesAsParent, 1);
    assert.equal(body.reassignments.notes, 1);
    assert.equal(body.reassignments.unionPartnerships, 0);

    // La prévisualisation ne modifie rien : la fusion réelle reste possible ensuite.
    const merged = await requestJson(server.baseUrl, '/api/search/merge', {
      method: 'POST',
      body: { survivorId: survivor.body.id, duplicateId: duplicate.body.id },
    });
    assert.equal(merged.status, 200);
  } finally {
    await server.close();
  }
});

test('POST /api/search/merge renvoie 404 pour une personne introuvable', async () => {
  const server = await startTestServer();
  try {
    const { status } = await requestJson(server.baseUrl, '/api/search/merge', {
      method: 'POST',
      body: { survivorId: 1, duplicateId: 999999 },
    });
    assert.equal(status, 404);
  } finally {
    await server.close();
  }
});
