import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { stopOcr } from '../../src/server/src/indexing/content-extract.js';
import { startTestServer, requestJson } from './helpers.js';

after(() => stopOcr());

const call = (server, method, path, body) =>
  requestJson(server.baseUrl, path, { method, ...(body ? { body } : {}) });

async function setup(server) {
  const person = async (givenNames) =>
    (await call(server, 'POST', '/api/persons', { givenNames, familyName: 'M' })).body.id;
  const ada = await person('Ada');
  const marc = await person('Marc');
  const event = (await call(server, 'POST', '/api/events', { type: 'MARRIAGE', dateText: '1900' }))
    .body.id;
  const union = (await call(server, 'POST', '/api/unions', { partnerIds: [ada, marc] })).body.id;
  const place = (await call(server, 'POST', '/api/places', { name: 'Nantes' })).body.id;
  const media = (
    await call(server, 'POST', '/api/media', {
      filename: 'noces.txt',
      contentBase64: Buffer.from('Menu du repas de noces').toString('base64'),
      entityType: 'EVENT',
      entityId: event,
    })
  ).body;
  return { ada, marc, event, union, place, media };
}

test('un média documente plusieurs fiches : événement, union, lieu et personnes présentes', async () => {
  const server = await startTestServer();
  try {
    const { ada, marc, event, union, place, media } = await setup(server);
    for (const link of [
      { entityType: 'UNION', entityId: union },
      { entityType: 'PLACE', entityId: place, role: 'LOCATION' },
      { entityType: 'PERSON', entityId: ada, role: 'PRESENT' },
      { entityType: 'PERSON', entityId: marc, role: 'PRESENT' },
    ]) {
      const created = await call(server, 'POST', `/api/media/${media.id}/links`, link);
      assert.equal(created.status, 201, JSON.stringify(link));
    }
    const links = (await call(server, 'GET', `/api/media/${media.id}/links`)).body;
    assert.equal(links.length, 4);
    assert.equal(links.find((l) => l.entityType === 'UNION').role, 'SUBJECT');

    // Le même média ressort pour chaque cible, principale ou liée, sans doublon.
    for (const [type, id] of [
      ['EVENT', event],
      ['UNION', union],
      ['PLACE', place],
      ['PERSON', ada],
      ['PERSON', marc],
    ]) {
      const list = (await call(server, 'GET', `/api/media/by-entity/${type}/${id}`)).body;
      assert.deepEqual(
        list.map((m) => m.id),
        [media.id],
        `${type}#${id}`,
      );
    }

    // « À qui appartient ce fichier ? » tient compte des personnes présentes.
    const owners = (await call(server, 'GET', `/api/media/${media.id}/owners`)).body;
    assert.deepEqual(
      owners.owners.map((o) => [o.id, o.reason]).sort(),
      [
        [ada, 'Présent(e) dans le document'],
        [marc, 'Présent(e) dans le document'],
      ].sort(),
    );

    // Idempotent ; suppression d'un lien sans toucher au média.
    const again = await call(server, 'POST', `/api/media/${media.id}/links`, {
      entityType: 'UNION',
      entityId: union,
    });
    assert.equal(again.body.id, links.find((l) => l.entityType === 'UNION').id);
    assert.equal((await call(server, 'GET', `/api/media/${media.id}/links`)).body.length, 4);
    assert.equal(
      (await call(server, 'DELETE', `/api/media/${media.id}/links/${again.body.id}`)).status,
      204,
    );
    assert.equal((await call(server, 'GET', `/api/media/by-entity/UNION/${union}`)).body.length, 0);
    assert.equal(
      (await call(server, 'DELETE', `/api/media/${media.id}/links/${again.body.id}`)).status,
      404,
    );
    assert.equal((await call(server, 'GET', `/api/media/${media.id}`)).status, 200);
  } finally {
    await server.close();
  }
});

test('liens de média : cible inexistante, type ou rôle invalide', async () => {
  const server = await startTestServer();
  try {
    const { ada, media } = await setup(server);
    for (const [body, status] of [
      [{ entityType: 'PERSON', entityId: 9999 }, 404],
      [{ entityType: 'MEDIA', entityId: ada }, 400],
      [{ entityType: 'PERSON', entityId: ada, role: 'BOSS' }, 400],
      [{ entityType: 'PERSON' }, 400],
      [{}, 400],
    ]) {
      assert.equal(
        (await call(server, 'POST', `/api/media/${media.id}/links`, body)).status,
        status,
        JSON.stringify(body),
      );
    }
    assert.equal(
      (await call(server, 'POST', '/api/media/9999/links', { entityType: 'PERSON', entityId: ada }))
        .status,
      404,
    );
  } finally {
    await server.close();
  }
});

test('lien web : conservé, décrit et relié à l’arbre, jamais suivi par l’application', async () => {
  const server = await startTestServer();
  try {
    const { ada } = await setup(server);
    const created = await call(server, 'POST', '/api/media/url', {
      url: 'https://archives.example.org/registre/1815?page=12',
      title: 'Registre paroissial en ligne',
      notes: 'Vue 12',
      entityType: 'PERSON',
      entityId: ada,
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.external_url, 'https://archives.example.org/registre/1815?page=12');
    assert.equal(created.body.mime_type, 'text/uri-list');
    assert.equal(created.body.size_bytes, 0);
    assert.equal(created.body.original_filename, 'Registre paroissial en ligne');

    // Métadonnées comme pour tout média : description, date, lieu, étiquettes.
    const described = await call(server, 'PATCH', `/api/media/${created.body.id}/photo`, {
      description: 'Acte de naissance, deuxième colonne',
      takenDate: '1815',
      tags: ['acte', 'naissance'],
    });
    assert.equal(described.status, 200);

    assert.equal((await call(server, 'GET', `/api/media/by-entity/PERSON/${ada}`)).body.length, 1);
    const download = await call(server, 'GET', `/api/media/${created.body.id}/content`);
    assert.equal(download.status, 409);
    const found = (
      await call(
        server,
        'GET',
        `/api/search?${new URLSearchParams({ q: 'paroissial', entityTypes: 'MEDIA' })}`,
      )
    ).body;
    assert.deepEqual(
      found.map((hit) => hit.entity_id),
      [created.body.id],
    );

    for (const url of [
      'javascript:alert(1)',
      'file:///etc/passwd',
      'ftp://exemple.org/x',
      'data:text/html,<script>',
      'pas une adresse',
      `https://exemple.org/${'a'.repeat(2100)}`,
    ]) {
      const rejected = await call(server, 'POST', '/api/media/url', { url, title: 'x' });
      assert.equal(rejected.status, 400, url.slice(0, 40));
    }
    assert.equal(
      (await call(server, 'POST', '/api/media/url', { url: 'https://a.org' })).status,
      400,
    );
    assert.equal(
      (
        await call(server, 'POST', '/api/media/url', {
          url: 'https://a.org',
          title: 't',
          entityType: 'PERSON',
          entityId: 9999,
        })
      ).status,
      404,
    );
  } finally {
    await server.close();
  }
});
