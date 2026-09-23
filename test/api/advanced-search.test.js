import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startTestServer, requestJson } from './helpers.js';

async function seed(baseUrl) {
  const person = async (givenNames, familyName, sex = 'U') =>
    (
      await requestJson(baseUrl, '/api/persons', {
        method: 'POST',
        body: { givenNames, familyName, sex },
      })
    ).body;
  const event = (type, dateText, personId, placeName) =>
    requestJson(baseUrl, '/api/events', {
      method: 'POST',
      body: {
        type,
        dateText,
        ...(placeName ? { placeName } : {}),
        participants: [{ personId, role: 'PRINCIPAL' }],
      },
    });
  const place = async (name) =>
    (await requestJson(baseUrl, '/api/places', { method: 'POST', body: { name } })).body;
  const nantes = await place('Nantes');
  const rouen = await place('Rouen');
  const jean = await person('Jean', 'Dupont', 'M');
  const jeanne = await person('Jeanne', 'Dupond', 'F');
  const paul = await person('Paul', 'Martin', 'M');
  await requestJson(baseUrl, '/api/events', {
    method: 'POST',
    body: {
      type: 'BIRTH',
      dateText: 'vers 1812',
      placeId: nantes.id,
      participants: [{ personId: jean.id, role: 'PRINCIPAL' }],
    },
  });
  await requestJson(baseUrl, '/api/events', {
    method: 'POST',
    body: {
      type: 'BIRTH',
      dateText: '3 mars 1850',
      placeId: rouen.id,
      participants: [{ personId: jeanne.id, role: 'PRINCIPAL' }],
    },
  });
  await event('DEATH', '1890', paul.id);
  return { jean, jeanne, paul };
}

const search = async (baseUrl, body) =>
  requestJson(baseUrl, '/api/search/advanced', { method: 'POST', body });

test('recherche floue et phonétique : Dupont retrouve Dupond, sauf en mode exact', async () => {
  const server = await startTestServer();
  try {
    await seed(server.baseUrl);
    const fuzzy = await search(server.baseUrl, { familyName: 'Dupon' });
    assert.deepEqual(fuzzy.body.results.map((r) => r.person.family_name).sort(), [
      'Dupond',
      'Dupont',
    ]);
    const exact = await search(server.baseUrl, { familyName: 'Dupont', fuzzy: false });
    assert.deepEqual(
      exact.body.results.map((r) => r.person.family_name),
      ['Dupont'],
    );
  } finally {
    await server.close();
  }
});

test('combine lieu, période (dates approximatives) et type d’événement', async () => {
  const server = await startTestServer();
  try {
    const { jean, jeanne } = await seed(server.baseUrl);
    const byPlace = await search(server.baseUrl, { place: 'nantes' });
    assert.deepEqual(
      byPlace.body.results.map((r) => r.person.id),
      [jean.id],
    );
    assert.equal(byPlace.body.results[0].matchedEvents[0].place, 'Nantes');

    const byPeriod = await search(server.baseUrl, {
      yearFrom: 1840,
      yearTo: 1860,
      eventType: 'BIRTH',
    });
    assert.deepEqual(
      byPeriod.body.results.map((r) => r.person.id),
      [jeanne.id],
    );

    const women = await search(server.baseUrl, { sex: 'F', familyName: 'Dup' });
    assert.deepEqual(
      women.body.results.map((r) => r.person.id),
      [jeanne.id],
    );

    const byId = await search(server.baseUrl, { identifier: `#${jean.id}` });
    assert.deepEqual(
      byId.body.results.map((r) => r.person.id),
      [jean.id],
    );
  } finally {
    await server.close();
  }
});

test('valide les filtres et ne renvoie rien sans critère', async () => {
  const server = await startTestServer();
  try {
    await seed(server.baseUrl);
    assert.equal((await search(server.baseUrl, {})).body.total, 0);
    for (const body of [
      { yearFrom: 'vers' },
      { eventType: 'VOL' },
      { sex: 'X' },
      { yearFrom: 1900, yearTo: 1800 },
    ]) {
      assert.equal((await search(server.baseUrl, body)).status, 400, JSON.stringify(body));
    }
  } finally {
    await server.close();
  }
});
