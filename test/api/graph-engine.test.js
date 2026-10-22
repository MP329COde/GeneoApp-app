import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { stopOcr } from '../../src/server/src/indexing/content-extract.js';
import { startTestServer, requestJson } from './helpers.js';

after(() => stopOcr());

async function build(server) {
  const person = async (givenNames, sex = 'U') =>
    (
      await requestJson(server.baseUrl, '/api/persons', {
        method: 'POST',
        body: { givenNames, familyName: 'Test', sex },
      })
    ).body.id;
  const link = async (childId, parentId, parentRole = 'PARENT', linkType = 'BIOLOGICAL') => {
    const response = await requestJson(server.baseUrl, '/api/parentages', {
      method: 'POST',
      body: { childId, parentId, parentRole, linkType },
    });
    assert.equal(response.status, 201, JSON.stringify(response.body));
  };
  const get = async (path) => (await requestJson(server.baseUrl, path)).body;
  return { person, link, get };
}

test('fratrie : frère plein, demi-frères paternel et maternel, par alliance, indéterminé', async () => {
  const server = await startTestServer();
  try {
    const { person, link, get } = await build(server);
    const pere = await person('Père', 'M');
    const mere = await person('Mère', 'F');
    const autrePere = await person('Autre père', 'M');
    const autreMere = await person('Autre mère', 'F');
    const moi = await person('Moi');
    const plein = await person('Plein');
    const demiPaternel = await person('Demi paternel');
    const demiMaternel = await person('Demi maternel');
    const parAlliance = await person('Par alliance');
    const seul = await person('Orphelin de mère');
    const celuiDeLaMemePere = await person('Même père seul');
    for (const [child, parents] of [
      [
        moi,
        [
          [pere, 'FATHER'],
          [mere, 'MOTHER'],
        ],
      ],
      [
        plein,
        [
          [pere, 'FATHER'],
          [mere, 'MOTHER'],
        ],
      ],
      [
        demiPaternel,
        [
          [pere, 'FATHER'],
          [autreMere, 'MOTHER'],
        ],
      ],
      [
        demiMaternel,
        [
          [autrePere, 'FATHER'],
          [mere, 'MOTHER'],
        ],
      ],
    ]) {
      for (const [parent, role] of parents) await link(child, parent, role);
    }
    await link(parAlliance, pere, 'FATHER', 'STEP');
    await link(celuiDeLaMemePere, pere, 'FATHER');
    void seul;

    const siblings = Object.fromEntries(
      (await get(`/api/persons/${moi}/relations`)).siblings.map((s) => [s.given_names, s]),
    );
    assert.equal(siblings.Plein.sibling_type, 'FULL');
    assert.equal(siblings.Plein.shared_parents, 2);
    assert.equal(siblings['Demi paternel'].sibling_type, 'HALF_PATERNAL');
    assert.equal(siblings['Demi maternel'].sibling_type, 'HALF_MATERNAL');
    assert.equal(siblings['Par alliance'].sibling_type, 'STEP');
    assert.equal(siblings['Par alliance'].shared_parents, 0);
    // Un seul parent connu pour lui, deux pour moi : on ne devine pas.
    assert.equal(siblings['Même père seul'].sibling_type, 'UNDETERMINED');
  } finally {
    await server.close();
  }
});

test('ancêtres : génération, branche paternelle/maternelle et profondeur configurable', async () => {
  const server = await startTestServer();
  try {
    const { person, link, get } = await build(server);
    const moi = await person('Moi');
    const pere = await person('Père', 'M');
    const mere = await person('Mère', 'F');
    const grandPerePat = await person('Grand-père paternel', 'M');
    const grandMereMat = await person('Grand-mère maternelle', 'F');
    const arriere = await person('Arrière-grand-père', 'M');
    await link(moi, pere, 'FATHER');
    await link(moi, mere, 'MOTHER');
    await link(pere, grandPerePat, 'FATHER');
    await link(mere, grandMereMat, 'MOTHER');
    await link(grandPerePat, arriere, 'FATHER');

    const ancestors = Object.fromEntries(
      (await get(`/api/persons/${moi}/ancestors`)).map((a) => [a.id, a]),
    );
    assert.equal(ancestors[pere].branch, 'PATERNAL');
    assert.equal(ancestors[mere].branch, 'MATERNAL');
    assert.equal(ancestors[grandPerePat].branch, 'PATERNAL');
    assert.equal(ancestors[grandMereMat].branch, 'MATERNAL');
    assert.equal(ancestors[arriere].generation, 3);
    assert.deepEqual(ancestors[arriere].generations, [3]);
    assert.equal(ancestors[arriere].viaId, grandPerePat);

    const shallow = await get(`/api/persons/${moi}/ancestors?depth=2`);
    assert.equal(shallow.length, 4);
    assert.deepEqual(await get(`/api/persons/${moi}/ancestors?depth=0`), []);
  } finally {
    await server.close();
  }
});

test('implexe : un ancêtre atteint par deux lignées apparaît à plusieurs générations, sans doublon', async () => {
  const server = await startTestServer();
  try {
    const { person, link, get } = await build(server);
    // Mariage entre cousins : l'ancêtre commun est au même niveau des deux côtés,
    // mais aussi grand-père de l'un et arrière-grand-père de l'autre.
    const ancetre = await person('Ancêtre', 'M');
    const pere = await person('Père', 'M');
    const mere = await person('Mère', 'F');
    const grandParentMere = await person('Grand-parent mère', 'F');
    const moi = await person('Moi');
    await link(pere, ancetre, 'FATHER');
    await link(grandParentMere, ancetre, 'FATHER');
    await link(mere, grandParentMere, 'MOTHER');
    await link(moi, pere, 'FATHER');
    await link(moi, mere, 'MOTHER');

    const ancestors = await get(`/api/persons/${moi}/ancestors`);
    const entries = ancestors.filter((a) => a.id === ancetre);
    assert.equal(entries.length, 1, 'une seule entrée par personne');
    assert.equal(entries[0].generation, 2);
    assert.deepEqual(entries[0].generations, [2, 3]);
    assert.deepEqual([...entries[0].branches].sort(), ['MATERNAL', 'PATERNAL']);
  } finally {
    await server.close();
  }
});

test('ascendance de sang : filtre sur la nature de la filiation', async () => {
  const server = await startTestServer();
  try {
    const { person, link, get } = await build(server);
    const enfant = await person('Enfant');
    const pere = await person('Père', 'M');
    const beauPere = await person('Beau-père', 'M');
    const tuteur = await person('Tuteur', 'M');
    await link(enfant, pere, 'FATHER');
    await link(enfant, beauPere, 'FATHER', 'STEP');
    await link(enfant, tuteur, 'PARENT', 'GUARDIAN');

    assert.equal((await get(`/api/persons/${enfant}/ancestors`)).length, 3);
    const sang = await get(`/api/persons/${enfant}/ancestors?linkTypes=biological`);
    assert.deepEqual(
      sang.map((a) => a.id),
      [pere],
    );
    const legal = await get(`/api/persons/${enfant}/ancestors?linkTypes=BIOLOGICAL,GUARDIAN`);
    assert.deepEqual(
      legal.map((a) => a.id).sort((a, b) => a - b),
      [pere, tuteur],
    );
  } finally {
    await server.close();
  }
});

test('données incohérentes : un cycle de filiations ne provoque aucune boucle infinie', async () => {
  const server = await startTestServer();
  try {
    const { person, link, get } = await build(server);
    const a = await person('A');
    const b = await person('B');
    const c = await person('C');
    await link(a, b);
    await link(b, c);
    // Cycle introduit hors API (donnée corrompue ou import défectueux).
    server.database
      .prepare("INSERT INTO parentages (child_id, parent_id, parent_role) VALUES (?, ?, 'PARENT')")
      .run(c, a);

    const ancestors = await get(`/api/persons/${a}/ancestors`);
    assert.deepEqual(ancestors.map((p) => p.id).sort(), [b, c].sort());
    assert.deepEqual(
      ancestors.map((p) => p.generations),
      ancestors.map((p) => [p.generation]),
      'les générations multiples sont ignorées quand les données sont cycliques',
    );
    assert.equal((await get(`/api/persons/${a}/descendants`)).length, 2);
    assert.ok((await get('/api/graph/cycles')).length >= 1);
    const relationship = await get(`/api/graph/relationship?personA=${a}&personB=${c}`);
    assert.ok(relationship.path.length > 0);
  } finally {
    await server.close();
  }
});
