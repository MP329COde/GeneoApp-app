import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { stopOcr } from '../../src/server/src/indexing/content-extract.js';

after(() => stopOcr());
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

test('GET /api/events renvoie tous les événements réels triés chronologiquement, avec lieu et participants', async () => {
  const server = await startTestServer();
  try {
    const ada = await createPerson(server.baseUrl, 'Ada', 'Lovelace');
    const place = await requestJson(server.baseUrl, '/api/places', {
      method: 'POST',
      body: { name: 'Londres' },
    });

    await requestJson(server.baseUrl, '/api/events', {
      method: 'POST',
      body: {
        type: 'DEATH',
        dateText: '1852-11-27',
        datePrecision: 'EXACT',
        participants: [{ personId: ada, role: 'PRINCIPAL' }],
      },
    });
    await requestJson(server.baseUrl, '/api/events', {
      method: 'POST',
      body: {
        type: 'BIRTH',
        dateText: '1815-12-10',
        datePrecision: 'EXACT',
        placeId: place.body.id,
        participants: [{ personId: ada, role: 'PRINCIPAL' }],
      },
    });
    await requestJson(server.baseUrl, '/api/events', {
      method: 'POST',
      body: { type: 'OTHER', datePrecision: 'UNKNOWN' },
    });

    const { status, body } = await requestJson(server.baseUrl, '/api/events');

    assert.equal(status, 200);
    assert.equal(body.length, 3);
    // Trié par date_text, les événements datés d'abord (naissance avant décès),
    // l'événement sans date en dernier.
    assert.deepEqual(
      body.map((event) => event.type),
      ['BIRTH', 'DEATH', 'OTHER'],
    );
    assert.equal(body[0].place_name, 'Londres');
    assert.equal(body[0].participants[0].personGivenNames, 'Ada');
  } finally {
    await server.close();
  }
});

test('la chronologie trie les dates généalogiques, pas le texte', async () => {
  const server = await startTestServer();
  try {
    const { body: person } = await requestJson(server.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: 'Jean', familyName: 'Tri' },
    });
    for (const dateText of ['1900', 'vers 1812', '03 MAR 1788', 'inconnue', 'entre 1650 et 1660']) {
      await requestJson(server.baseUrl, '/api/events', {
        method: 'POST',
        body: {
          type: 'OTHER',
          dateText,
          participants: [{ personId: person.id, role: 'PRINCIPAL' }],
        },
      });
    }
    const { body } = await requestJson(server.baseUrl, '/api/events');
    assert.deepEqual(
      body.map((event) => event.date_text),
      ['entre 1650 et 1660', '03 MAR 1788', 'vers 1812', '1900', 'inconnue'],
    );
    const forPerson = await requestJson(server.baseUrl, `/api/events/by-person/${person.id}`);
    assert.equal(forPerson.body[0].date_text, 'entre 1650 et 1660');
  } finally {
    await server.close();
  }
});

test('un décès enregistré (saisie ou GEDCOM) rend la personne décédée, et c’est annulable', async () => {
  const server = await startTestServer();
  try {
    const { body: person } = await requestJson(server.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: 'Jean', familyName: 'Défunt' },
    });
    assert.equal(person.is_living, 1);
    await requestJson(server.baseUrl, '/api/events', {
      method: 'POST',
      body: {
        type: 'DEATH',
        dateText: '1851',
        participants: [{ personId: person.id, role: 'PRINCIPAL' }],
      },
    });
    assert.equal(
      (await requestJson(server.baseUrl, `/api/persons/${person.id}`)).body.is_living,
      0,
    );
    await requestJson(server.baseUrl, '/api/history/undo', { method: 'POST' });
    assert.equal(
      (await requestJson(server.baseUrl, `/api/persons/${person.id}`)).body.is_living,
      1,
    );

    const imported = await requestJson(server.baseUrl, '/api/gedcom/import', {
      method: 'POST',
      body: {
        gedcom:
          '0 HEAD\n1 GEDC\n2 VERS 7\n0 @I1@ INDI\n1 NAME Anne /Morte/\n1 DEAT\n2 DATE 1900\n0 @I2@ INDI\n1 NAME Paul /Vivant/\n0 TRLR\n',
      },
    });
    const [dead, alive] = imported.body.ids.persons;
    assert.equal((await requestJson(server.baseUrl, `/api/persons/${dead}`)).body.is_living, 0);
    assert.equal((await requestJson(server.baseUrl, `/api/persons/${alive}`)).body.is_living, 1);
  } finally {
    await server.close();
  }
});
