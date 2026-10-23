import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { stopOcr } from '../../src/server/src/indexing/content-extract.js';
import { startTestServer, requestJson } from './helpers.js';
import { suggestProofLevel } from '../../src/db/src/repositories/assertion-repository.js';

after(() => stopOcr());

const post = (server, path, body) => requestJson(server.baseUrl, path, { method: 'POST', body });
const get = (server, path) => requestJson(server.baseUrl, path);

async function person(server, givenNames = 'Ada', familyName = 'Lovelace') {
  return (await post(server, '/api/persons', { givenNames, familyName })).body;
}

async function login(server) {
  await post(server, '/api/accounts', { name: 'Alice' });
  return (await post(server, '/api/accounts/login', { name: 'Alice' })).body.token;
}

test('deux sources contradictoires coexistent : la contradiction est signalée, rien n’est écrasé', async () => {
  const server = await startTestServer();
  try {
    const ada = await person(server);
    const acte = await post(server, '/api/assertions', {
      entityType: 'PERSON',
      entityId: ada.id,
      field: 'Birth_Date',
      value: '3 mars 1815',
    });
    assert.equal(acte.status, 201);
    assert.equal(acte.body.field, 'birth_date');
    assert.equal(acte.body.status, 'PROPOSED');
    assert.equal(acte.body.proof_level, 'UNSUPPORTED');
    const livret = await post(server, '/api/assertions', {
      entityType: 'PERSON',
      entityId: ada.id,
      field: 'birth_date',
      value: '5 mars 1815',
    });

    const conflicts = await get(
      server,
      `/api/assertions/conflicts?entityType=PERSON&entityId=${ada.id}`,
    );
    assert.equal(conflicts.body.length, 1);
    assert.equal(conflicts.body[0].field, 'birth_date');
    assert.deepEqual(
      conflicts.body[0].assertions.map((a) => a.value),
      ['3 mars 1815', '5 mars 1815'],
    );

    // La même valeur à la casse près n'est pas une contradiction.
    await post(server, '/api/assertions', {
      entityType: 'PERSON',
      entityId: ada.id,
      field: 'sex',
      value: 'Féminin',
    });
    await post(server, '/api/assertions', {
      entityType: 'PERSON',
      entityId: ada.id,
      field: 'sex',
      value: ' féminin ',
    });
    assert.equal((await get(server, '/api/assertions/conflicts')).body.length, 1);

    // Retenir une valeur ne clôt pas la contradiction tant que l'autre n'est pas écartée.
    const accepted = await post(server, `/api/assertions/${acte.body.id}/accept`);
    assert.equal(accepted.body.status, 'ACCEPTED');
    const stillOpen = (await get(server, '/api/assertions/conflicts')).body;
    assert.equal(stillOpen.length, 1);
    assert.equal(stillOpen[0].accepted.id, acte.body.id);

    // Écarter l'autre est une décision explicite, réversible, qui conserve la donnée.
    const rejected = await post(server, `/api/assertions/${livret.body.id}/reject`);
    assert.equal(rejected.body.status, 'REJECTED');
    assert.equal((await get(server, '/api/assertions/conflicts')).body.length, 0);
    const all = await get(
      server,
      `/api/assertions?entityType=PERSON&entityId=${ada.id}&field=birth_date`,
    );
    assert.equal(all.body.length, 2, 'l’affirmation écartée reste consultable');

    const reopened = await post(server, `/api/assertions/${livret.body.id}/reopen`);
    assert.equal(reopened.body.status, 'PROPOSED');
    assert.equal((await get(server, '/api/assertions/conflicts')).body.length, 1);
  } finally {
    await server.close();
  }
});

test('une seule affirmation retenue par champ : la précédente redevient proposée, jamais écartée', async () => {
  const server = await startTestServer();
  try {
    const ada = await person(server);
    const create = async (value) =>
      (
        await post(server, '/api/assertions', {
          entityType: 'PERSON',
          entityId: ada.id,
          field: 'birth_place',
          value,
        })
      ).body;
    const londres = await create('Londres');
    const paris = await create('Paris');
    await post(server, `/api/assertions/${londres.id}/accept`);
    await post(server, `/api/assertions/${paris.id}/accept`);
    assert.equal((await get(server, `/api/assertions/${londres.id}`)).body.status, 'PROPOSED');
    assert.equal((await get(server, `/api/assertions/${paris.id}`)).body.status, 'ACCEPTED');
  } finally {
    await server.close();
  }
});

test('citations d’une affirmation : nature de la preuve, qualité de l’information, niveau suggéré', async () => {
  const server = await startTestServer();
  try {
    const ada = await person(server);
    const assertion = (
      await post(server, '/api/assertions', {
        entityType: 'PERSON',
        entityId: ada.id,
        field: 'birth_date',
        value: '10 décembre 1815',
      })
    ).body;
    const source = async (title, sourceKind) =>
      (await post(server, '/api/sources', { title, sourceKind })).body;
    const registre = await source('Registre paroissial', 'ORIGINAL');
    assert.equal(registre.source_kind, 'ORIGINAL');
    const biographie = await source('Biographie', 'AUTHORED');
    const cite = (sourceId, extra) =>
      post(server, '/api/sources/citations', {
        sourceId,
        entityType: 'ASSERTION',
        entityId: assertion.id,
        ...extra,
      });

    assert.equal(
      (await get(server, `/api/assertions/${assertion.id}`)).body.support.suggestedProofLevel,
      'UNSUPPORTED',
    );

    assert.equal(
      (await cite(biographie.id, { evidenceType: 'INDIRECT', informationQuality: 'SECONDARY' }))
        .status,
      201,
    );
    assert.equal(
      (await get(server, `/api/assertions/${assertion.id}`)).body.support.suggestedProofLevel,
      'POSSIBLE',
    );

    await cite(registre.id, {
      evidenceType: 'DIRECT',
      informationQuality: 'PRIMARY',
      quotation: 'né le dix décembre',
      page: 'f. 12',
    });
    const probable = (await get(server, `/api/assertions/${assertion.id}`)).body;
    assert.equal(probable.support.suggestedProofLevel, 'PROBABLE');
    assert.equal(probable.support.independentSources, 2);

    const second = await source('État civil', 'ORIGINAL');
    await cite(second.id, { evidenceType: 'DIRECT', informationQuality: 'PRIMARY' });
    assert.equal(
      (await get(server, `/api/assertions/${assertion.id}`)).body.support.suggestedProofLevel,
      'PROVEN',
    );

    // Le niveau suggéré n'écrase jamais le niveau choisi par l'utilisateur.
    assert.equal(
      (await get(server, `/api/assertions/${assertion.id}`)).body.proof_level,
      'UNSUPPORTED',
    );
    const set = await requestJson(server.baseUrl, `/api/assertions/${assertion.id}`, {
      method: 'PATCH',
      body: { proofLevel: 'PROBABLE', reasoning: 'Deux actes concordants.' },
    });
    assert.equal(set.body.proof_level, 'PROBABLE');

    // Une preuve négative plafonne la suggestion.
    await cite(registre.id, { evidenceType: 'NEGATIVE' });
    assert.equal(
      (await get(server, `/api/assertions/${assertion.id}`)).body.support.suggestedProofLevel,
      'POSSIBLE',
    );

    const listed = await get(server, `/api/sources/citations/ASSERTION/${assertion.id}`);
    assert.equal(listed.body.length, 4);
    assert.equal(listed.body.find((c) => c.quotation)?.page, 'f. 12');
  } finally {
    await server.close();
  }
});

test('règles de suggestion du niveau de preuve', () => {
  const base = {
    citations: 0,
    independentSources: 0,
    direct: 0,
    indirect: 0,
    negative: 0,
    primary: 0,
  };
  assert.equal(suggestProofLevel(base), 'UNSUPPORTED');
  assert.equal(suggestProofLevel({ ...base, citations: 1 }), 'POSSIBLE');
  assert.equal(
    suggestProofLevel({ ...base, citations: 2, indirect: 2, independentSources: 2 }),
    'PROBABLE',
  );
  assert.equal(
    suggestProofLevel({ ...base, citations: 1, direct: 1, independentSources: 1 }),
    'PROBABLE',
  );
  // Deux preuves directes mais d'une seule source, ou sans information primaire : pas « prouvé ».
  assert.equal(
    suggestProofLevel({ ...base, citations: 2, direct: 2, independentSources: 1, primary: 2 }),
    'PROBABLE',
  );
  assert.equal(
    suggestProofLevel({ ...base, citations: 2, direct: 2, independentSources: 2, primary: 0 }),
    'PROBABLE',
  );
  assert.equal(
    suggestProofLevel({ ...base, citations: 2, direct: 2, independentSources: 2, primary: 1 }),
    'PROVEN',
  );
  assert.equal(
    suggestProofLevel({
      ...base,
      citations: 3,
      direct: 2,
      negative: 1,
      independentSources: 2,
      primary: 2,
    }),
    'POSSIBLE',
  );
});

test('validation : entité inconnue, champ invalide, citation d’une cible inexistante', async () => {
  const server = await startTestServer();
  try {
    const ada = await person(server);
    const bad = [
      [{ entityType: 'PERSON', entityId: ada.id, field: 'Bad Field!', value: 'x' }, 400],
      [{ entityType: 'PERSON', entityId: ada.id, field: 'birth_date', value: '   ' }, 400],
      [{ entityType: 'PERSON', entityId: ada.id, field: 'birth_date' }, 400],
      [{ entityType: 'MEDIA', entityId: ada.id, field: 'birth_date', value: 'x' }, 400],
      [
        {
          entityType: 'PERSON',
          entityId: ada.id,
          field: 'birth_date',
          value: 'x',
          proofLevel: 'CERTAIN',
        },
        400,
      ],
      [{ entityType: 'PERSON', entityId: 9999, field: 'birth_date', value: 'x' }, 404],
    ];
    for (const [body, status] of bad) {
      assert.equal(
        (await post(server, '/api/assertions', body)).status,
        status,
        JSON.stringify(body),
      );
    }
    assert.equal((await get(server, '/api/assertions/9999')).status, 404);
    assert.equal((await post(server, '/api/assertions/9999/accept')).status, 404);

    const source = (await post(server, '/api/sources', { title: 'S' })).body;
    assert.equal(
      (await post(server, '/api/sources', { title: 'S', sourceKind: 'COPIE' })).status,
      400,
    );
    for (const [extra, status] of [
      [{ entityType: 'ASSERTION', entityId: 9999 }, 404],
      [{ entityType: 'PLACE', entityId: 9999 }, 404],
      [{ entityType: 'PERSON', entityId: ada.id, evidenceType: 'PROVEN' }, 400],
      [{ entityType: 'PERSON', entityId: ada.id, informationQuality: 'GOOD' }, 400],
    ]) {
      const result = await post(server, '/api/sources/citations', {
        sourceId: source.id,
        ...extra,
      });
      assert.equal(result.status, status, JSON.stringify(extra));
    }
  } finally {
    await server.close();
  }
});

test('fusion de doublons : affirmations et identifiants conservés, contradictions rendues visibles', async () => {
  const server = await startTestServer();
  try {
    const survivor = await person(server, 'Jean', 'Dupont');
    const duplicate = await person(server, 'Jean', 'Dupond');
    const assert1 = (
      await post(server, '/api/assertions', {
        entityType: 'PERSON',
        entityId: survivor.id,
        field: 'birth_date',
        value: '1850',
      })
    ).body;
    const assert2 = (
      await post(server, '/api/assertions', {
        entityType: 'PERSON',
        entityId: duplicate.id,
        field: 'birth_date',
        value: '1851',
      })
    ).body;
    await post(server, `/api/assertions/${assert1.id}/accept`);
    await post(server, `/api/assertions/${assert2.id}/accept`);
    await post(server, `/api/persons/${survivor.id}/identifiers`, {
      scheme: 'WIKIDATA',
      value: 'Q1',
    });
    await post(server, `/api/persons/${duplicate.id}/identifiers`, {
      scheme: 'WIKIDATA',
      value: 'Q1',
    });
    await post(server, `/api/persons/${duplicate.id}/identifiers`, {
      scheme: 'GENEANET',
      value: 'G9',
    });

    const preview = await get(
      server,
      `/api/search/merge/preview?survivorId=${survivor.id}&duplicateId=${duplicate.id}`,
    );
    assert.equal(preview.body.reassignments.assertions, 1);
    assert.equal(preview.body.reassignments.identifiers, 2);

    const merged = await post(server, '/api/search/merge', {
      survivorId: survivor.id,
      duplicateId: duplicate.id,
    });
    assert.equal(merged.status, 200);

    const identifiers = await get(server, `/api/persons/${survivor.id}/identifiers`);
    assert.deepEqual(
      identifiers.body.map((i) => `${i.scheme}:${i.value}`),
      ['GENEANET:G9', 'WIKIDATA:Q1'],
    );

    const conflicts = (
      await get(server, `/api/assertions/conflicts?entityType=PERSON&entityId=${survivor.id}`)
    ).body;
    // Dupont / Dupond : le nom de famille est lui aussi une contradiction conservée.
    assert.deepEqual(conflicts.map((c) => c.field).sort(), ['birth_date', 'family_name']);
    const birth = conflicts.find((c) => c.field === 'birth_date');
    assert.deepEqual(birth.assertions.map((a) => a.value).sort(), ['1850', '1851']);
    assert.equal(birth.accepted.value, '1850', 'la valeur retenue du survivant est conservée');
  } finally {
    await server.close();
  }
});

test('corbeille : une affirmation supprimée se restaure, sa purge emporte ses citations', async () => {
  const server = await startTestServer();
  try {
    const token = await login(server);
    const ada = await person(server);
    const assertion = (
      await post(server, '/api/assertions', {
        entityType: 'PERSON',
        entityId: ada.id,
        field: 'occupation',
        value: 'Mathématicienne',
      })
    ).body;
    const source = (await post(server, '/api/sources', { title: 'Lettre' })).body;
    await post(server, '/api/sources/citations', {
      sourceId: source.id,
      entityType: 'ASSERTION',
      entityId: assertion.id,
    });

    await requestJson(server.baseUrl, `/api/assertions/${assertion.id}`, { method: 'DELETE' });
    assert.equal((await get(server, `/api/assertions/${assertion.id}`)).status, 404);
    const trash = await get(server, '/api/trash');
    assert.ok(
      trash.body.some((entry) => entry.table === 'assertions' && entry.id === assertion.id),
    );

    const restored = await requestJson(
      server.baseUrl,
      `/api/trash/assertions/${assertion.id}/restore`,
      {
        method: 'POST',
        headers: { 'x-geneoapp-session': token },
      },
    );
    assert.equal(restored.status, 200);
    assert.equal(restored.body.value, 'Mathématicienne');

    // Purger la personne emporte ses affirmations et leurs citations.
    await requestJson(server.baseUrl, `/api/persons/${ada.id}`, { method: 'DELETE' });
    const purged = await requestJson(server.baseUrl, `/api/trash/persons/${ada.id}`, {
      method: 'DELETE',
      headers: { 'x-geneoapp-session': token },
    });
    assert.equal(purged.status, 204);
    assert.equal(server.database.prepare('SELECT COUNT(*) AS n FROM assertions').get().n, 0);
    assert.equal(
      server.database
        .prepare("SELECT COUNT(*) AS n FROM citations WHERE entity_type = 'ASSERTION'")
        .get().n,
      0,
    );
  } finally {
    await server.close();
  }
});
