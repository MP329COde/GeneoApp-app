import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, test } from 'node:test';
import { stopOcr } from '../../src/server/src/indexing/content-extract.js';

after(() => stopOcr());
import { startTestServer, requestJson } from './helpers.js';

async function uploadPhoto(baseUrl, personId) {
  const png = await readFile(new URL('../fixtures/sample.png', import.meta.url));
  const { status, body } = await requestJson(baseUrl, '/api/media', {
    method: 'POST',
    body: {
      filename: 'mariage 1908.png',
      contentBase64: png.toString('base64'),
      entityType: 'PERSON',
      entityId: personId,
    },
  });
  assert.equal(status, 201);
  return body;
}

async function person(baseUrl, givenNames, familyName) {
  return (
    await requestJson(baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames, familyName },
    })
  ).body;
}

test('décrit une photo (date, lieu, description, tags normalisés)', async () => {
  const server = await startTestServer();
  try {
    const jean = await person(server.baseUrl, 'Jean', 'Dupont');
    const photo = await uploadPhoto(server.baseUrl, jean.id);
    const { body: place } = await requestJson(server.baseUrl, '/api/places', {
      method: 'POST',
      body: { name: 'Elbeuf' },
    });
    const updated = await requestJson(server.baseUrl, `/api/media/${photo.id}/photo`, {
      method: 'PATCH',
      body: {
        takenDate: 'vers 1908',
        placeId: place.id,
        description: 'Mariage Lefèvre',
        tags: ['mariage', ' famille ', 'mariage'],
      },
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.taken_date, 'vers 1908');
    assert.equal(updated.body.place.name, 'Elbeuf');
    assert.equal(updated.body.tags, 'mariage, famille');
  } finally {
    await server.close();
  }
});

test('identifie manuellement les personnes sur une photo et retrouve leurs photos', async () => {
  const server = await startTestServer();
  try {
    const jean = await person(server.baseUrl, 'Jean', 'Dupont');
    const marie = await person(server.baseUrl, 'Marie', 'Martin');
    const photo = await uploadPhoto(server.baseUrl, jean.id);

    const region = await requestJson(server.baseUrl, `/api/media/${photo.id}/regions`, {
      method: 'POST',
      body: { personId: marie.id, x: 0.1, y: 0.2, width: 0.25, height: 0.3 },
    });
    assert.equal(region.status, 201);
    assert.equal(region.body.given_names, 'Marie');
    await requestJson(server.baseUrl, `/api/media/${photo.id}/regions`, {
      method: 'POST',
      body: { label: 'Inconnu au chapeau', x: 0.6, y: 0.1, width: 0.2, height: 0.2 },
    });

    const { body: details } = await requestJson(server.baseUrl, `/api/media/${photo.id}/photo`);
    assert.equal(details.regions.length, 2);

    const { body: marieImages } = await requestJson(
      server.baseUrl,
      `/api/media/photos/by-person/${marie.id}`,
    );
    assert.deepEqual(
      marieImages.map((item) => item.id),
      [photo.id],
    );

    await requestJson(server.baseUrl, `/api/media/regions/${region.body.id}`, { method: 'DELETE' });
    const { body: after } = await requestJson(
      server.baseUrl,
      `/api/media/photos/by-person/${marie.id}`,
    );
    assert.deepEqual(after, []);
  } finally {
    await server.close();
  }
});

test('refuse les zones invalides et les références inexistantes', async () => {
  const server = await startTestServer();
  try {
    const jean = await person(server.baseUrl, 'Jean', 'Dupont');
    const photo = await uploadPhoto(server.baseUrl, jean.id);
    const cases = [
      [{ personId: jean.id, x: -0.1, y: 0, width: 0.2, height: 0.2 }, 400],
      [{ personId: jean.id, x: 0.9, y: 0, width: 0.2, height: 0.2 }, 400],
      [{ personId: jean.id, x: 0, y: 0, width: 0, height: 0.2 }, 400],
      [{ x: 0, y: 0, width: 0.2, height: 0.2 }, 400],
      [{ personId: 999, x: 0, y: 0, width: 0.2, height: 0.2 }, 404],
    ];
    for (const [body, expected] of cases) {
      const { status } = await requestJson(server.baseUrl, `/api/media/${photo.id}/regions`, {
        method: 'POST',
        body,
      });
      assert.equal(status, expected, JSON.stringify(body));
    }
    const badTags = await requestJson(server.baseUrl, `/api/media/${photo.id}/photo`, {
      method: 'PATCH',
      body: { tags: ['x'.repeat(41)] },
    });
    assert.equal(badTags.status, 400);
    const missing = await requestJson(server.baseUrl, '/api/media/999/photo');
    assert.equal(missing.status, 404);
  } finally {
    await server.close();
  }
});
