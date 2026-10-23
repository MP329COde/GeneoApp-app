import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { stopOcr } from '../../src/server/src/indexing/content-extract.js';

after(() => stopOcr());
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

test('profession, notes, identifiants externes, alias et tous les types d’événement', async () => {
  const server = await startTestServer();
  try {
    const call = (path, body) => requestJson(server.baseUrl, path, { method: 'POST', body });
    const person = async (body) =>
      (await call('/api/persons', { familyName: 'Test', ...body })).body;
    const forgeron = await person({
      givenNames: 'Pierre',
      alias: 'Le Forgeron',
      notes: 'arrivé par bateau',
    });
    const meunier = await person({ givenNames: 'Paul' });
    await call('/api/events', {
      type: 'OCCUPATION',
      value: 'Forgeron',
      dateText: '1880',
      participants: [{ personId: forgeron.id, role: 'PRINCIPAL' }],
    });
    await call('/api/events', {
      type: 'OCCUPATION',
      value: 'Meunier',
      participants: [{ personId: meunier.id, role: 'PRINCIPAL' }],
    });
    await call('/api/events', {
      type: 'SUCCESSION',
      notes: 'héritage de la ferme',
      participants: [{ personId: meunier.id, role: 'HEIR' }],
    });
    await call('/api/notes', {
      entityType: 'PERSON',
      entityId: meunier.id,
      body: 'Moulin de la Vallée',
    });
    await call(`/api/persons/${forgeron.id}/identifiers`, { scheme: 'WIKIDATA', value: 'Q4242' });

    const names = async (body) =>
      (await search(server.baseUrl, body)).body.results.map((r) => r.person.given_names).sort();
    assert.deepEqual(await names({ occupation: 'forge' }), ['Pierre']);
    assert.deepEqual(await names({ occupation: 'meun' }), ['Paul']);
    assert.deepEqual(await names({ eventType: 'OCCUPATION' }), ['Paul', 'Pierre']);
    assert.deepEqual(await names({ eventType: 'SUCCESSION' }), ['Paul']);
    assert.deepEqual(await names({ note: 'moulin' }), ['Paul'], 'note de la table notes');
    assert.deepEqual(await names({ note: 'bateau' }), ['Pierre'], 'note de la fiche');
    assert.deepEqual(await names({ note: 'ferme' }), ['Paul'], 'note d’événement');
    assert.deepEqual(await names({ identifier: 'q4242' }), ['Pierre'], 'identifiant externe');
    assert.deepEqual(await names({ givenNames: 'Forgeron' }), ['Pierre'], 'alias');
    const bad = await search(server.baseUrl, { eventType: 'INVENTED' });
    assert.equal(bad.status, 400);
  } finally {
    await server.close();
  }
});

test('géographie : lieu englobant, nom historique, rectangle et rayon', async () => {
  const server = await startTestServer();
  try {
    const call = (path, body) => requestJson(server.baseUrl, path, { method: 'POST', body });
    const place = async (body) => (await call('/api/places', body)).body;
    const yvelines = await place({ name: 'Yvelines', placeType: 'DEPARTMENT' });
    const seine = await place({ name: 'Seine-et-Oise', placeType: 'DEPARTMENT' });
    const versailles = await place({ name: 'Versailles', latitude: 48.8049, longitude: 2.1204 });
    const lyon = await place({ name: 'Lyon', latitude: 45.764, longitude: 4.8357 });
    await call(`/api/places/${versailles.id}/parents`, {
      parentPlaceId: seine.id,
      validToYear: 1967,
    });
    await call(`/api/places/${versailles.id}/parents`, {
      parentPlaceId: yvelines.id,
      validFromYear: 1968,
    });
    await call(`/api/places/${lyon.id}/names`, { name: 'Lugdunum', validToYear: 400 });

    const person = async (givenNames) =>
      (await call('/api/persons', { givenNames, familyName: 'Geo' })).body;
    const ancien = await person('Ancien');
    const moderne = await person('Moderne');
    const lyonnais = await person('Lyonnais');
    const birth = (personId, placeId, dateText) =>
      call('/api/events', {
        type: 'BIRTH',
        dateText,
        placeId,
        participants: [{ personId, role: 'PRINCIPAL' }],
      });
    await birth(ancien.id, versailles.id, '1900');
    await birth(moderne.id, versailles.id, '1990');
    await birth(lyonnais.id, lyon.id, '1950');

    const names = async (body) =>
      (await search(server.baseUrl, body)).body.results.map((r) => r.person.given_names).sort();
    // La hiérarchie est celle de l'année de l'événement.
    assert.deepEqual(await names({ place: 'Seine-et-Oise' }), ['Ancien']);
    assert.deepEqual(await names({ place: 'Yvelines' }), ['Moderne']);
    assert.deepEqual(await names({ place: 'versailles' }), ['Ancien', 'Moderne']);
    assert.deepEqual(await names({ place: 'Lugdunum' }), ['Lyonnais'], 'nom historique');

    assert.deepEqual(await names({ bbox: { south: 48, north: 49.5, west: 1.5, east: 3 } }), [
      'Ancien',
      'Moderne',
    ]);
    assert.deepEqual(await names({ near: { latitude: 45.75, longitude: 4.85, radiusKm: 20 } }), [
      'Lyonnais',
    ]);
    assert.deepEqual(await names({ near: { latitude: 48.85, longitude: 2.35, radiusKm: 30 } }), [
      'Ancien',
      'Moderne',
    ]);
    // Période + géographie se combinent.
    assert.deepEqual(
      await names({ bbox: { south: 48, north: 49.5, west: 1.5, east: 3 }, yearFrom: 1950 }),
      ['Moderne'],
    );
    for (const body of [
      { bbox: { south: 50, north: 40, west: 0, east: 1 } },
      { bbox: { south: 1 } },
      { near: { latitude: 200, longitude: 0, radiusKm: 5 } },
      { near: { latitude: 1, longitude: 1, radiusKm: -5 } },
      {
        bbox: { south: 1, north: 2, west: 0, east: 1 },
        near: { latitude: 1, longitude: 1, radiusKm: 5 },
      },
    ]) {
      assert.equal((await search(server.baseUrl, body)).status, 400, JSON.stringify(body));
    }
  } finally {
    await server.close();
  }
});
