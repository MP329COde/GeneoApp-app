import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { stopOcr } from '../../src/server/src/indexing/content-extract.js';
import { startTestServer, requestJson } from './helpers.js';

after(() => stopOcr());

const post = (server, path, body) => requestJson(server.baseUrl, path, { method: 'POST', body });

test('cohérence : erreurs certaines et situations inhabituelles sont séparées', async () => {
  const server = await startTestServer();
  try {
    const person = async (givenNames, sex = 'U') =>
      (await post(server, '/api/persons', { givenNames, familyName: 'T', sex })).body.id;
    const link = (childId, parentId, extra = {}) =>
      post(server, '/api/parentages', { childId, parentId, ...extra });

    const enfant = await person('Enfant');
    const pere1 = await person('Père 1', 'M');
    const pere2 = await person('Père 2', 'M');
    const femmePere = await person('Femme père', 'F');
    const frere = await person('Frère');
    const soeur = await person('Sœur', 'F');
    const commun = await person('Parent commun', 'M');

    // Certaine : deux pères biologiques.
    await link(enfant, pere1, { parentRole: 'FATHER' });
    await link(enfant, pere2, { parentRole: 'FATHER' });
    // Inhabituelle : rôle « père » sur une personne de sexe féminin.
    await link(frere, femmePere, { parentRole: 'FATHER' });
    // Inhabituelle : union entre un frère et une sœur.
    await link(frere, commun);
    await link(soeur, commun);
    await post(server, '/api/unions', { partnerIds: [frere, soeur] });
    // Inhabituelle : union enregistrée deux fois.
    await post(server, '/api/unions', { partnerIds: [frere, soeur] });
    // Certaine : filiation rattachée à une union dont le parent n'est pas partenaire.
    const union = (await post(server, '/api/unions', { partnerIds: [pere1, femmePere] })).body;
    await link(soeur, pere2, { unionId: union.id });

    const { body } = await requestJson(server.baseUrl, '/api/graph/consistency');
    const codes = (list) => list.map((issue) => issue.code).sort();
    assert.deepEqual(codes(body.certain), ['MULTIPLE_BIOLOGICAL_FATHERS', 'PARENT_NOT_IN_UNION']);
    assert.deepEqual(codes(body.unusual), [
      'DUPLICATE_UNION',
      'PARENT_ROLE_SEX_MISMATCH',
      'UNION_BETWEEN_SIBLINGS',
      'UNION_BETWEEN_SIBLINGS',
    ]);
    assert.deepEqual(body.counts, { certain: 2, unusual: 4 });
    assert.ok(body.certain.every((issue) => issue.severity === 'CERTAIN'));
    assert.ok(body.unusual.every((issue) => issue.severity === 'POSSIBLE'));
    assert.ok(body.unusual.every((issue) => typeof issue.message === 'string'));

    // La liste historique de la chronologie contient aussi les incohérences relationnelles.
    const timeline = (await requestJson(server.baseUrl, '/api/graph/timeline')).body;
    assert.ok(timeline.some((issue) => issue.code === 'MULTIPLE_BIOLOGICAL_FATHERS'));
    // Rien n'est corrigé ni supprimé automatiquement.
    assert.equal(
      server.database.prepare('SELECT COUNT(*) AS n FROM parentages WHERE deleted_at IS NULL').get()
        .n,
      6,
    );
  } finally {
    await server.close();
  }
});

test('cohérence : un cycle de filiation est une erreur certaine ; un arbre sain ne signale rien', async () => {
  const server = await startTestServer();
  try {
    const sain = await requestJson(server.baseUrl, '/api/graph/consistency');
    assert.deepEqual(sain.body, { certain: [], unusual: [], counts: { certain: 0, unusual: 0 } });

    const a = (await post(server, '/api/persons', { givenNames: 'A', familyName: 'T' })).body;
    const b = (await post(server, '/api/persons', { givenNames: 'B', familyName: 'T' })).body;
    await post(server, '/api/parentages', { childId: a.id, parentId: b.id });
    // Cycle introduit hors API (l'API le refuse désormais) : donnée corrompue.
    server.database
      .prepare("INSERT INTO parentages (child_id, parent_id, parent_role) VALUES (?, ?, 'PARENT')")
      .run(b.id, a.id);
    const { body } = await requestJson(server.baseUrl, '/api/graph/consistency');
    assert.ok(body.certain.some((issue) => issue.code === 'ANCESTRY_CYCLE'));
    assert.equal(body.unusual.length, 0);
  } finally {
    await server.close();
  }
});

test('cohérence : une personne sans anomalie et une union entre ancêtre et descendant', async () => {
  const server = await startTestServer();
  try {
    const grandpa = (await post(server, '/api/persons', { givenNames: 'G', familyName: 'T' })).body;
    const petite = (await post(server, '/api/persons', { givenNames: 'P', familyName: 'T' })).body;
    const mid = (await post(server, '/api/persons', { givenNames: 'M', familyName: 'T' })).body;
    await post(server, '/api/parentages', { childId: mid.id, parentId: grandpa.id });
    await post(server, '/api/parentages', { childId: petite.id, parentId: mid.id });
    await post(server, '/api/unions', { partnerIds: [grandpa.id, petite.id] });
    const { body } = await requestJson(server.baseUrl, '/api/graph/consistency');
    assert.deepEqual(
      body.unusual.map((issue) => issue.code),
      ['UNION_BETWEEN_ANCESTOR_AND_DESCENDANT'],
    );
    assert.equal(body.certain.length, 0);
  } finally {
    await server.close();
  }
});
