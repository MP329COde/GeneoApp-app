import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { stopOcr } from '../../src/server/src/indexing/content-extract.js';
import { startTestServer, requestJson } from './helpers.js';

after(() => stopOcr());

const call = (server, method, path, body) =>
  requestJson(server.baseUrl, path, { method, ...(body ? { body } : {}) });

async function people(server, names) {
  const ids = [];
  for (const name of names) {
    ids.push(
      (await call(server, 'POST', '/api/persons', { givenNames: name, familyName: 'X' })).body.id,
    );
  }
  return ids;
}

test('unions : liste, modification, ajout et retrait de partenaires (familles recomposées)', async () => {
  const server = await startTestServer();
  try {
    const [a, b, c] = await people(server, ['A', 'B', 'C']);
    const event = (
      await call(server, 'POST', '/api/events', { type: 'MARRIAGE', dateText: '1900' })
    ).body;
    const union = (await call(server, 'POST', '/api/unions', { partnerIds: [a, b] })).body;

    const updated = await call(server, 'PATCH', `/api/unions/${union.id}`, {
      type: 'MARRIAGE',
      startEventId: event.id,
      notes: 'mariage civil',
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.type, 'MARRIAGE');
    assert.equal(updated.body.start_event_id, event.id);
    assert.deepEqual(updated.body.partnerIds.sort(), [a, b].sort());
    assert.equal(
      (await call(server, 'PATCH', `/api/unions/${union.id}`, { startEventId: null })).body
        .start_event_id,
      null,
    );

    const list = await call(server, 'GET', '/api/unions');
    assert.equal(list.body.length, 1);
    assert.equal((await call(server, 'GET', `/api/unions/by-person/${a}`)).body.length, 1);

    const added = await call(server, 'POST', `/api/unions/${union.id}/partners`, { personId: c });
    assert.equal(added.status, 201);
    assert.equal(added.body.partnerIds.length, 3);
    assert.equal(
      (await call(server, 'POST', `/api/unions/${union.id}/partners`, { personId: c })).status,
      409,
    );

    const removed = await call(server, 'DELETE', `/api/unions/${union.id}/partners/${c}`);
    assert.equal(removed.status, 200);
    assert.equal(removed.body.partnerIds.length, 2);
    // Une union garde au moins deux partenaires.
    assert.equal(
      (await call(server, 'DELETE', `/api/unions/${union.id}/partners/${b}`)).status,
      400,
    );
    assert.equal(
      (await call(server, 'DELETE', `/api/unions/${union.id}/partners/${c}`)).status,
      404,
    );
    // Le partenaire retiré peut être rajouté.
    assert.equal(
      (await call(server, 'POST', `/api/unions/${union.id}/partners`, { personId: c })).status,
      201,
    );
  } finally {
    await server.close();
  }
});

test('unions : erreurs de saisie renvoyées en 400/404, jamais en 500', async () => {
  const server = await startTestServer();
  try {
    const [a, b] = await people(server, ['A', 'B']);
    const union = (await call(server, 'POST', '/api/unions', { partnerIds: [a, b] })).body;
    const cases = [
      ['POST', '/api/unions', { partnerIds: [a, a] }, 400],
      ['POST', '/api/unions', { partnerIds: [a, 9999] }, 404],
      ['POST', '/api/unions', { partnerIds: [a, b], startEventId: 9999 }, 404],
      ['POST', '/api/unions', { partnerIds: [a, b], type: 'PACS' }, 400],
      ['PATCH', `/api/unions/${union.id}`, {}, 400],
      ['PATCH', `/api/unions/${union.id}`, { type: null }, 400],
      ['PATCH', `/api/unions/${union.id}`, { type: 'PACS' }, 400],
      ['PATCH', `/api/unions/${union.id}`, { endEventId: 9999 }, 404],
      ['PATCH', '/api/unions/9999', { notes: 'x' }, 404],
      ['POST', `/api/unions/${union.id}/partners`, { personId: 9999 }, 404],
      ['POST', `/api/unions/${union.id}/partners`, {}, 400],
      ['POST', '/api/unions/9999/partners', { personId: a }, 404],
    ];
    for (const [method, path, body, status] of cases) {
      const response = await call(server, method, path, body);
      assert.equal(response.status, status, `${method} ${path} ${JSON.stringify(body)}`);
    }
  } finally {
    await server.close();
  }
});

test('filiations : modification, liste, doublon, cycle et références inexistantes', async () => {
  const server = await startTestServer();
  try {
    const [grand, parent, child, stranger] = await people(server, ['G', 'P', 'C', 'S']);
    const link = (childId, parentId, extra = {}) =>
      call(server, 'POST', '/api/parentages', { childId, parentId, ...extra });
    const first = (await link(child, parent, { parentRole: 'FATHER' })).body;
    await link(parent, grand);

    const updated = await call(server, 'PATCH', `/api/parentages/${first.id}`, {
      linkType: 'ADOPTIVE',
      notes: 'adoption plénière',
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.link_type, 'ADOPTIVE');
    assert.equal(updated.body.parent_role, 'FATHER', 'les champs non fournis sont conservés');
    assert.equal((await call(server, 'GET', '/api/parentages')).body.length, 2);

    const cases = [
      [link(child, parent), 409], // doublon
      [link(grand, child), 409], // cycle : le petit-enfant deviendrait parent de l'aïeul
      [link(grand, parent), 409], // cycle direct inverse
      [link(child, 9999), 404],
      [link(9999, parent), 404],
      [link(stranger, parent, { unionId: 9999 }), 404],
      [call(server, 'PATCH', `/api/parentages/${first.id}`, {}), 400],
      [call(server, 'PATCH', `/api/parentages/${first.id}`, { linkType: 'LEGAL' }), 400],
      [call(server, 'PATCH', `/api/parentages/${first.id}`, { parentRole: null }), 400],
      [call(server, 'PATCH', `/api/parentages/${first.id}`, { unionId: 9999 }), 404],
      [call(server, 'PATCH', '/api/parentages/9999', { notes: 'x' }), 404],
    ];
    for (const [pending, status] of cases) {
      const response = await pending;
      assert.equal(response.status, status, JSON.stringify(response.body));
    }
    // Rien n'a été créé par les tentatives refusées.
    assert.equal((await call(server, 'GET', '/api/parentages')).body.length, 2);
    // Une filiation supprimée libère la place : on peut la recréer.
    await call(server, 'DELETE', `/api/parentages/${first.id}`);
    assert.equal((await link(child, parent)).status, 201);
  } finally {
    await server.close();
  }
});

test('fiche famille : partenaires, enfants avec nature des liens, événements et familles d’une personne', async () => {
  const server = await startTestServer();
  try {
    const [pere, mere, beauPere, enfant, enfant2] = await people(server, [
      'Père',
      'Mère',
      'Beau-père',
      'E1',
      'E2',
    ]);
    const marriage = (
      await call(server, 'POST', '/api/events', { type: 'MARRIAGE', dateText: '1900' })
    ).body;
    const union = (
      await call(server, 'POST', '/api/unions', {
        partnerIds: [pere, mere],
        type: 'MARRIAGE',
        startEventId: marriage.id,
      })
    ).body;
    const second = (await call(server, 'POST', '/api/unions', { partnerIds: [mere, beauPere] }))
      .body;
    const link = (childId, parentId, extra) =>
      call(server, 'POST', '/api/parentages', { childId, parentId, ...extra });
    await link(enfant, pere, { parentRole: 'FATHER', unionId: union.id });
    await link(enfant, mere, { parentRole: 'MOTHER', unionId: union.id });
    await link(enfant2, mere, { parentRole: 'MOTHER', unionId: second.id });
    await link(enfant2, beauPere, { parentRole: 'FATHER', unionId: second.id, linkType: 'STEP' });

    const family = (await call(server, 'GET', `/api/unions/${union.id}/family`)).body;
    assert.deepEqual(family.partners.map((p) => p.id).sort(), [pere, mere].sort());
    assert.deepEqual(
      family.children.map((c) => c.id),
      [enfant],
    );
    assert.equal(family.children[0].links.length, 2);
    assert.equal(family.startEvent.id, marriage.id);
    assert.equal(family.endEvent, null);

    const recomposed = (await call(server, 'GET', `/api/unions/${second.id}/family`)).body;
    assert.deepEqual(
      recomposed.children.map((c) => c.id),
      [enfant2],
    );
    assert.ok(recomposed.children[0].links.some((l) => l.linkType === 'STEP'));

    const mereFamilies = (await call(server, 'GET', `/api/unions/families-of/${mere}`)).body;
    assert.deepEqual(mereFamilies.asPartner.sort(), [union.id, second.id].sort());
    assert.deepEqual(
      (await call(server, 'GET', `/api/unions/families-of/${enfant}`)).body.asChild,
      [union.id],
    );
    assert.equal((await call(server, 'GET', '/api/unions/9999/family')).status, 404);
  } finally {
    await server.close();
  }
});
