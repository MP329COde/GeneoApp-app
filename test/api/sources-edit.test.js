import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { stopOcr } from '../../src/server/src/indexing/content-extract.js';
import { startTestServer, requestJson } from './helpers.js';

after(() => stopOcr());

const call = (server, method, path, body, headers) =>
  requestJson(server.baseUrl, path, {
    method,
    ...(body ? { body } : {}),
    ...(headers ? { headers } : {}),
  });

async function login(server) {
  await call(server, 'POST', '/api/accounts', { name: 'Alice' });
  return (await call(server, 'POST', '/api/accounts/login', { name: 'Alice' })).body.token;
}

test('sources : liste, modification, indexation de recherche mise à jour', async () => {
  const server = await startTestServer();
  try {
    const source = (await call(server, 'POST', '/api/sources', { title: 'Registre ancien' })).body;
    await call(server, 'POST', '/api/sources', { title: 'Autre' });
    assert.equal((await call(server, 'GET', '/api/sources')).body.length, 2);

    const updated = await call(server, 'PATCH', `/api/sources/${source.id}`, {
      title: 'Registre paroissial',
      author: 'Curé Martin',
      sourceKind: 'ORIGINAL',
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.title, 'Registre paroissial');
    assert.equal(updated.body.source_kind, 'ORIGINAL');

    const found = async (q) =>
      (
        await call(
          server,
          'GET',
          `/api/search?${new URLSearchParams({ q, entityTypes: 'SOURCE' })}`,
        )
      ).body.length;
    assert.equal(await found('paroissial'), 1);
    assert.equal(await found('ancien'), 0, 'l’ancien titre n’est plus indexé');

    for (const [body, status] of [
      [{}, 400],
      [{ title: '   ' }, 400],
      [{ title: null }, 400],
      [{ sourceKind: 'COPIE' }, 400],
    ]) {
      assert.equal((await call(server, 'PATCH', `/api/sources/${source.id}`, body)).status, status);
    }
    assert.equal((await call(server, 'PATCH', '/api/sources/9999', { title: 'x' })).status, 404);
  } finally {
    await server.close();
  }
});

test('citations : lecture, modification, suppression et restauration', async () => {
  const server = await startTestServer();
  try {
    const token = await login(server);
    const person = (
      await call(server, 'POST', '/api/persons', { givenNames: 'Ada', familyName: 'L' })
    ).body;
    const source = (await call(server, 'POST', '/api/sources', { title: 'Registre' })).body;
    const citationId = (
      await call(server, 'POST', '/api/sources/citations', {
        sourceId: source.id,
        entityType: 'PERSON',
        entityId: person.id,
        page: 'f. 1',
      })
    ).body.id;

    assert.equal(
      (await call(server, 'GET', `/api/sources/citation/${citationId}`)).body.page,
      'f. 1',
    );
    const updated = await call(server, 'PATCH', `/api/sources/citation/${citationId}`, {
      page: 'f. 2',
      confidence: 'HIGH',
      evidenceType: 'DIRECT',
      informationQuality: 'PRIMARY',
      quotation: 'né le dix décembre',
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.confidence, 'HIGH');
    assert.equal(updated.body.quotation, 'né le dix décembre');
    assert.equal(updated.body.entity_id, person.id, 'la cible ne change pas');

    for (const [body, status] of [
      [{}, 400],
      [{ confidence: 'CERTAIN' }, 400],
      [{ evidenceType: null }, 400],
    ]) {
      assert.equal(
        (await call(server, 'PATCH', `/api/sources/citation/${citationId}`, body)).status,
        status,
      );
    }
    assert.equal(
      (await call(server, 'PATCH', '/api/sources/citation/9999', { page: 'x' })).status,
      404,
    );

    assert.equal((await call(server, 'DELETE', `/api/sources/citation/${citationId}`)).status, 204);
    assert.equal(
      (await call(server, 'GET', `/api/sources/citations/PERSON/${person.id}`)).body.length,
      0,
    );
    assert.equal((await call(server, 'GET', `/api/sources/citation/${citationId}`)).status, 404);

    const restored = await call(
      server,
      'POST',
      `/api/trash/citations/${citationId}/restore`,
      undefined,
      {
        'x-geneoapp-session': token,
      },
    );
    assert.equal(restored.status, 200);
    assert.equal(
      (await call(server, 'GET', `/api/sources/citations/PERSON/${person.id}`)).body.length,
      1,
    );
  } finally {
    await server.close();
  }
});

test('suppression d’une source : refusée tant qu’elle est utilisée, restaurable ensuite', async () => {
  const server = await startTestServer();
  try {
    const token = await login(server);
    const person = (
      await call(server, 'POST', '/api/persons', { givenNames: 'Ada', familyName: 'L' })
    ).body;
    const source = (await call(server, 'POST', '/api/sources', { title: 'Registre unique' })).body;
    const citationId = (
      await call(server, 'POST', '/api/sources/citations', {
        sourceId: source.id,
        entityType: 'PERSON',
        entityId: person.id,
      })
    ).body.id;

    const blocked = await call(server, 'DELETE', `/api/sources/${source.id}`);
    assert.equal(blocked.status, 409);
    assert.match(blocked.body.error.message, /1 citation/);

    await call(server, 'DELETE', `/api/sources/citation/${citationId}`);
    assert.equal((await call(server, 'DELETE', `/api/sources/${source.id}`)).status, 204);
    assert.equal((await call(server, 'GET', `/api/sources/${source.id}`)).status, 404);
    assert.equal(
      (
        await call(
          server,
          'GET',
          `/api/search?${new URLSearchParams({ q: 'unique', entityTypes: 'SOURCE' })}`,
        )
      ).body.length,
      0,
    );
    assert.equal((await call(server, 'DELETE', `/api/sources/${source.id}`)).status, 404);

    const trash = (await call(server, 'GET', '/api/trash')).body;
    assert.ok(trash.some((entry) => entry.table === 'sources' && entry.id === source.id));
    const restored = await call(
      server,
      'POST',
      `/api/trash/sources/${source.id}/restore`,
      undefined,
      {
        'x-geneoapp-session': token,
      },
    );
    assert.equal(restored.status, 200);
    assert.equal(
      (
        await call(
          server,
          'GET',
          `/api/search?${new URLSearchParams({ q: 'unique', entityTypes: 'SOURCE' })}`,
        )
      ).body.length,
      1,
    );

    // Purge définitive d'une source supprimée, avec ses citations déjà supprimées.
    await call(server, 'DELETE', `/api/sources/${source.id}`);
    const purged = await call(server, 'DELETE', `/api/trash/sources/${source.id}`, undefined, {
      'x-geneoapp-session': token,
    });
    assert.equal(purged.status, 204);
    assert.equal(server.database.prepare('SELECT COUNT(*) AS n FROM sources').get().n, 0);
    assert.equal(server.database.prepare('SELECT COUNT(*) AS n FROM citations').get().n, 0);
  } finally {
    await server.close();
  }
});
