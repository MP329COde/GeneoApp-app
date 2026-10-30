import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { stopOcr } from '../../src/server/src/indexing/content-extract.js';
import { startTestServer, requestJson } from './helpers.js';

after(() => stopOcr());

async function createPlace(server, body) {
  const { status, body: place } = await requestJson(server.baseUrl, '/api/places', {
    method: 'POST',
    body,
  });
  assert.equal(status, 201);
  return place;
}

const post = (server, path, body) => requestJson(server.baseUrl, path, { method: 'POST', body });

async function login(server) {
  await requestJson(server.baseUrl, '/api/accounts', { method: 'POST', body: { name: 'Alice' } });
  const { body } = await requestJson(server.baseUrl, '/api/accounts/login', {
    method: 'POST',
    body: { name: 'Alice' },
  });
  return body.token;
}

test('un lieu a une nature administrative modifiable', async () => {
  const server = await startTestServer();
  try {
    const place = await createPlace(server, { name: 'Versailles', placeType: 'COMMUNE' });
    assert.equal(place.place_type, 'COMMUNE');

    const updated = await requestJson(server.baseUrl, `/api/places/${place.id}`, {
      method: 'PATCH',
      body: { name: 'Versailles (78)', placeType: 'DISTRICT', latitude: 48.8, longitude: 2.13 },
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.name, 'Versailles (78)');
    assert.equal(updated.body.place_type, 'DISTRICT');
    assert.equal(updated.body.latitude, 48.8);

    for (const body of [{ placeType: 'PLANET' }, { name: '   ' }, {}]) {
      const rejected = await requestJson(server.baseUrl, `/api/places/${place.id}`, {
        method: 'PATCH',
        body,
      });
      assert.equal(rejected.status, 400, JSON.stringify(body));
    }
    const unknown = await requestJson(server.baseUrl, '/api/places/9999', {
      method: 'PATCH',
      body: { name: 'x' },
    });
    assert.equal(unknown.status, 404);
  } finally {
    await server.close();
  }
});

test('noms datés : le nom résolu dépend de l’année', async () => {
  const server = await startTestServer();
  try {
    const place = await createPlace(server, { name: 'Ho Chi Minh-Ville' });
    await post(server, `/api/places/${place.id}/names`, {
      name: 'Saïgon',
      language: 'fr',
      validFromYear: 1698,
      validToYear: 1975,
    });
    const added = await post(server, `/api/places/${place.id}/names`, {
      name: 'Gia Định',
      validToYear: 1801,
    });
    assert.equal(added.status, 201);
    assert.equal(added.body.validFromYear, null);

    const resolve = async (year) =>
      (await requestJson(server.baseUrl, `/api/places/${place.id}/resolve?year=${year}`)).body.name;
    assert.equal(await resolve(1750), 'Saïgon'); // le nom daté le plus précis l'emporte
    assert.equal(await resolve(1900), 'Saïgon');
    assert.equal(await resolve(1975), 'Saïgon');
    assert.equal(await resolve(1976), 'Ho Chi Minh-Ville'); // hors période : nom courant
    assert.equal(await resolve(1500), 'Gia Định');
    const current = await requestJson(server.baseUrl, `/api/places/${place.id}/resolve`);
    assert.equal(current.body.name, 'Ho Chi Minh-Ville');

    const names = await requestJson(server.baseUrl, `/api/places/${place.id}/names`);
    assert.deepEqual(
      names.body.map((item) => item.name),
      ['Gia Định', 'Saïgon'],
    );

    const removed = await requestJson(
      server.baseUrl,
      `/api/places/${place.id}/names/${added.body.id}`,
      { method: 'DELETE' },
    );
    assert.equal(removed.status, 204);
    assert.equal(await resolve(1500), 'Ho Chi Minh-Ville');
  } finally {
    await server.close();
  }
});

test('hiérarchie administrative évolutive : une commune change de département', async () => {
  const server = await startTestServer();
  try {
    const france = await createPlace(server, { name: 'France', placeType: 'COUNTRY' });
    const seineEtOise = await createPlace(server, { name: 'Seine-et-Oise' });
    const yvelines = await createPlace(server, { name: 'Yvelines', placeType: 'DEPARTMENT' });
    const versailles = await createPlace(server, { name: 'Versailles', placeType: 'COMMUNE' });
    await post(server, `/api/places/${seineEtOise.id}/names`, { name: 'Seine-et-Oise' });
    for (const department of [seineEtOise, yvelines]) {
      const link = await post(server, `/api/places/${department.id}/parents`, {
        parentPlaceId: france.id,
      });
      assert.equal(link.status, 201);
    }
    assert.equal(
      (
        await post(server, `/api/places/${versailles.id}/parents`, {
          parentPlaceId: seineEtOise.id,
          validToYear: 1967,
        })
      ).status,
      201,
    );
    assert.equal(
      (
        await post(server, `/api/places/${versailles.id}/parents`, {
          parentPlaceId: yvelines.id,
          validFromYear: 1968,
        })
      ).status,
      201,
    );

    const resolve = async (year) =>
      (
        await requestJson(
          server.baseUrl,
          `/api/places/${versailles.id}/resolve${year ? `?year=${year}` : ''}`,
        )
      ).body;
    assert.equal((await resolve(1900)).fullName, 'Versailles, Seine-et-Oise, France');
    assert.equal((await resolve(1967)).fullName, 'Versailles, Seine-et-Oise, France');
    assert.equal((await resolve(1968)).fullName, 'Versailles, Yvelines, France');
    assert.equal((await resolve()).fullName, 'Versailles, Yvelines, France');
    assert.deepEqual(
      (await resolve(1900)).chain.map((item) => item.name),
      ['Versailles', 'Seine-et-Oise', 'France'],
    );

    const parents = await requestJson(server.baseUrl, `/api/places/${versailles.id}/parents`);
    assert.deepEqual(
      parents.body.map((item) => item.parentName),
      ['Seine-et-Oise', 'Yvelines'],
    );
  } finally {
    await server.close();
  }
});

test('hiérarchie : cycles, chevauchements et périodes invalides sont refusés', async () => {
  const server = await startTestServer();
  try {
    const a = await createPlace(server, { name: 'A' });
    const b = await createPlace(server, { name: 'B' });
    const c = await createPlace(server, { name: 'C' });
    assert.equal(
      (await post(server, `/api/places/${a.id}/parents`, { parentPlaceId: b.id })).status,
      201,
    );
    assert.equal(
      (await post(server, `/api/places/${b.id}/parents`, { parentPlaceId: c.id })).status,
      201,
    );

    // Cycle direct et indirect.
    assert.equal(
      (await post(server, `/api/places/${a.id}/parents`, { parentPlaceId: a.id })).status,
      400,
    );
    assert.equal(
      (await post(server, `/api/places/${b.id}/parents`, { parentPlaceId: a.id })).status,
      409,
    );
    assert.equal(
      (await post(server, `/api/places/${c.id}/parents`, { parentPlaceId: a.id })).status,
      409,
    );

    // Chevauchement avec le rattachement ouvert de A → B.
    const overlap = await post(server, `/api/places/${a.id}/parents`, {
      parentPlaceId: c.id,
      validFromYear: 1900,
    });
    assert.equal(overlap.status, 409);

    for (const body of [
      { parentPlaceId: c.id, validFromYear: 1900, validToYear: 1800 },
      { parentPlaceId: c.id, validFromYear: 'x' },
      { parentPlaceId: 'x' },
      {},
    ]) {
      assert.equal(
        (await post(server, `/api/places/${b.id}/parents`, body)).status,
        400,
        JSON.stringify(body),
      );
    }
    assert.equal(
      (await post(server, `/api/places/${a.id}/parents`, { parentPlaceId: 9999 })).status,
      404,
    );
    assert.equal(
      (
        await post(server, `/api/places/${a.id}/names`, {
          name: 'Ancien A',
          validFromYear: 2000,
          validToYear: 1000,
        })
      ).status,
      400,
    );
  } finally {
    await server.close();
  }
});

test('la purge définitive d’un lieu et d’une personne emporte leurs dépendances', async () => {
  const server = await startTestServer();
  try {
    const token = await login(server);
    const parent = await createPlace(server, { name: 'Parent' });
    const place = await createPlace(server, { name: 'Enfant' });
    await post(server, `/api/places/${place.id}/names`, { name: 'Ancien nom' });
    await post(server, `/api/places/${place.id}/parents`, { parentPlaceId: parent.id });
    await requestJson(server.baseUrl, `/api/places/${place.id}`, { method: 'DELETE' });
    const purged = await requestJson(server.baseUrl, `/api/trash/places/${place.id}`, {
      method: 'DELETE',
      headers: { 'x-geneoapp-session': token },
    });
    assert.equal(purged.status, 204);

    const { body: person } = await post(server, '/api/persons', {
      givenNames: 'Ada',
      familyName: 'L',
    });
    await post(server, `/api/persons/${person.id}/identifiers`, {
      scheme: 'WIKIDATA',
      value: 'Q1',
    });
    await requestJson(server.baseUrl, `/api/persons/${person.id}`, { method: 'DELETE' });
    const purgedPerson = await requestJson(server.baseUrl, `/api/trash/persons/${person.id}`, {
      method: 'DELETE',
      headers: { 'x-geneoapp-session': token },
    });
    assert.equal(purgedPerson.status, 204);
    assert.equal(
      server.database.prepare('SELECT COUNT(*) AS n FROM person_identifiers').get().n,
      0,
    );
    assert.equal(server.database.prepare('SELECT COUNT(*) AS n FROM place_names').get().n, 0);
    assert.equal(server.database.prepare('SELECT COUNT(*) AS n FROM place_parents').get().n, 0);
  } finally {
    await server.close();
  }
});

test('restaurer un lieu recréé entre-temps fusionne aussi son historique administratif', async () => {
  const server = await startTestServer();
  try {
    const token = await login(server);
    const department = await createPlace(server, { name: 'Département' });
    const original = await createPlace(server, { name: 'Commune' });
    await post(server, `/api/places/${original.id}/names`, { name: 'Ancien nom de la commune' });
    const child = await createPlace(server, { name: 'Hameau' });
    await post(server, `/api/places/${child.id}/parents`, { parentPlaceId: original.id });
    await post(server, `/api/places/${original.id}/parents`, { parentPlaceId: department.id });

    await requestJson(server.baseUrl, `/api/places/${original.id}`, { method: 'DELETE' });
    const recreated = await createPlace(server, { name: 'Commune' });
    const restored = await requestJson(server.baseUrl, `/api/trash/places/${original.id}/restore`, {
      method: 'POST',
      headers: { 'x-geneoapp-session': token },
    });
    assert.equal(restored.status, 200);
    assert.equal(restored.body.id, recreated.id);

    // Le nom daté et le hameau suivent le lieu conservé.
    const names = await requestJson(server.baseUrl, `/api/places/${recreated.id}/names`);
    assert.deepEqual(
      names.body.map((item) => item.name),
      ['Ancien nom de la commune'],
    );
    const hamlet = await requestJson(server.baseUrl, `/api/places/${child.id}/resolve`);
    assert.equal(hamlet.body.fullName, 'Hameau, Commune');
  } finally {
    await server.close();
  }
});
