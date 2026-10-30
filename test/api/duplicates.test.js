import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { stopOcr } from '../../src/server/src/indexing/content-extract.js';
import { startTestServer, requestJson } from './helpers.js';

after(() => stopOcr());

const post = (server, path, body) => requestJson(server.baseUrl, path, { method: 'POST', body });

async function person(server, body) {
  return (await post(server, '/api/persons', { familyName: 'Dupont', ...body })).body;
}

async function birth(server, personId, dateText, placeId) {
  await post(server, '/api/events', {
    type: 'BIRTH',
    dateText,
    ...(placeId ? { placeId } : {}),
    participants: [{ personId, role: 'PRINCIPAL' }],
  });
}

test('doublons : score explicable, somme des raisons égale au score, jamais de fusion', async () => {
  const server = await startTestServer();
  try {
    const place = (await post(server, '/api/places', { name: 'Nantes' })).body;
    const a = await person(server, { givenNames: 'Jean', sex: 'M' });
    const b = await person(server, { givenNames: 'Jean', sex: 'M' });
    await birth(server, a.id, '1850', place.id);
    await birth(server, b.id, '1852', place.id);

    const { body } = await requestJson(server.baseUrl, '/api/search/duplicates');
    assert.equal(body.total, 1);
    const [pair] = body.items;
    assert.equal(pair.requiresValidation, true);
    const codes = pair.reasons.map((reason) => reason.code);
    assert.deepEqual(codes.sort(), ['BIRTH_YEAR_CLOSE', 'NAME_SIMILAR', 'SAME_BIRTH_PLACE']);
    assert.equal(
      Math.min(
        100,
        pair.reasons.reduce((sum, reason) => sum + reason.weight, 0),
      ),
      pair.score,
      'le score est exactement la somme des raisons affichées',
    );
    assert.equal(pair.reasons.find((r) => r.code === 'BIRTH_YEAR_CLOSE').detail.left, 1850);
    assert.equal(
      server.database.prepare('SELECT COUNT(*) AS n FROM persons WHERE deleted_at IS NULL').get().n,
      2,
      'détecter ne fusionne jamais',
    );
  } finally {
    await server.close();
  }
});

test('doublons : sexes incompatibles pénalisés, écart de naissance trop grand exclu', async () => {
  const server = await startTestServer();
  try {
    const a = await person(server, { givenNames: 'Claude', sex: 'M' });
    const b = await person(server, { givenNames: 'Claude', sex: 'F' });
    const c = await person(server, { givenNames: 'Claude', sex: 'M' });
    const d = await person(server, { givenNames: 'Claude', sex: 'M' });
    await birth(server, a.id, '1850');
    await birth(server, b.id, '1850');
    await birth(server, c.id, '1700');
    await birth(server, d.id, '1851');

    const { body } = await requestJson(server.baseUrl, '/api/search/duplicates');
    const pairs = body.items.map((item) =>
      item.persons
        .map((p) => p.id)
        .sort((x, y) => x - y)
        .join('-'),
    );
    assert.ok(
      pairs.includes(`${a.id}-${d.id}`),
      'même sexe, naissances proches : doublon probable',
    );
    assert.ok(!pairs.some((pair) => pair.includes(String(c.id))), 'né en 1700 : exclu');
    const mixed = body.items.find((item) => item.persons.some((p) => p.id === b.id));
    if (mixed) {
      assert.ok(mixed.reasons.some((reason) => reason.code === 'SEX_DIFFERS' && reason.weight < 0));
      const same = body.items.find(
        (item) =>
          item.persons
            .map((p) => p.id)
            .sort()
            .join('-') === `${a.id}-${d.id}`,
      );
      assert.ok(mixed.score < same.score, 'des sexes différents font baisser le score');
    }
  } finally {
    await server.close();
  }
});

test('fusion : contradictions d’identité et d’événements conservées, champs vides complétés', async () => {
  const server = await startTestServer();
  try {
    const survivor = await person(server, {
      givenNames: 'Jean',
      familyName: 'Dupont',
      sex: 'M',
      nickname: 'Jeannot',
    });
    const duplicate = await person(server, {
      givenNames: 'Jehan',
      familyName: 'Dupont',
      sex: 'M',
      marriedName: 'Martin',
      title: 'Sieur',
      nickname: 'Jeannet',
    });
    const place = (name) => post(server, '/api/places', { name }).then((r) => r.body.id);
    await birth(server, survivor.id, '1850', await place('Nantes'));
    await birth(server, duplicate.id, '1851', await place('Rennes'));

    const preview = (
      await requestJson(
        server.baseUrl,
        `/api/search/merge/preview?survivorId=${survivor.id}&duplicateId=${duplicate.id}`,
      )
    ).body;
    assert.deepEqual(preview.identity.conflicts.map((c) => c.field).sort(), [
      'given_names',
      'nickname',
    ]);
    assert.deepEqual(preview.identity.fills.map((f) => f.field).sort(), ['married_name', 'title']);

    const merged = await post(server, '/api/search/merge', {
      survivorId: survivor.id,
      duplicateId: duplicate.id,
    });
    assert.equal(merged.status, 200);
    assert.equal(
      merged.body.given_names,
      'Jean',
      'l’identité de la fiche conservée n’est pas écrasée',
    );
    assert.equal(merged.body.married_name, 'Martin', 'champ vide complété');
    assert.equal(merged.body.title, 'Sieur');
    assert.deepEqual(merged.body.mergeReport.filledFields.sort(), ['married_name', 'title']);

    const conflicts = (
      await requestJson(
        server.baseUrl,
        `/api/assertions/conflicts?entityType=PERSON&entityId=${survivor.id}`,
      )
    ).body;
    const byField = Object.fromEntries(conflicts.map((c) => [c.field, c]));
    assert.deepEqual(Object.keys(byField).sort(), [
      'birth_date',
      'birth_place',
      'given_names',
      'nickname',
    ]);
    assert.equal(byField.given_names.accepted.value, 'Jean');
    assert.deepEqual(byField.given_names.assertions.map((a) => a.value).sort(), ['Jean', 'Jehan']);
    assert.match(
      byField.given_names.assertions.find((a) => a.value === 'Jehan').reasoning,
      /fiche fusionnée #\d+/,
    );
    assert.deepEqual(byField.birth_place.assertions.map((a) => a.value).sort(), [
      'Nantes',
      'Rennes',
    ]);
    // Rien n'est tranché à la place de l'utilisateur.
    assert.ok(byField.birth_date.assertions.every((a) => a.status === 'PROPOSED'));

    // La fusion est réversible : la fiche fusionnée reste dans la corbeille.
    const trash = (await requestJson(server.baseUrl, '/api/trash')).body;
    assert.ok(trash.some((entry) => entry.table === 'persons' && entry.id === duplicate.id));
  } finally {
    await server.close();
  }
});
