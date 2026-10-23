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

test('chemins multiples : deux frères pleins sont reliés par leur père et par leur mère', async () => {
  const server = await startTestServer();
  try {
    const { person, link, get } = await build(server);
    const pere = await person('Père', 'M');
    const mere = await person('Mère', 'F');
    const a = await person('A');
    const b = await person('B');
    for (const child of [a, b]) {
      await link(child, pere, 'FATHER');
      await link(child, mere, 'MOTHER');
    }

    const paths = await get(`/api/graph/path?personA=${a}&personB=${b}`);
    assert.equal(paths.length, 2);
    assert.deepEqual(
      paths.map((path) => path.map((step) => step.via)),
      [
        ['START', 'PARENT', 'CHILD'],
        ['START', 'PARENT', 'CHILD'],
      ],
    );
    assert.deepEqual(paths.map((path) => path[1].personId).sort(), [pere, mere].sort());

    assert.equal((await get(`/api/graph/path?personA=${a}&personB=${b}&limit=1`)).length, 1);
    assert.equal((await get(`/api/graph/path?personA=${a}&personB=${b}&depth=1`)).length, 0);
    assert.equal((await get(`/api/graph/path?personA=${a}&personB=${b}&depth=2`)).length, 2);
    assert.deepEqual(await get(`/api/graph/path?personA=${a}&personB=${a}`), [
      [{ personId: a, via: 'SELF' }],
    ]);
  } finally {
    await server.close();
  }
});

test('chemin : absence de relation, conjoint, personne inconnue, paramètres invalides', async () => {
  const server = await startTestServer();
  try {
    const { person, get } = await build(server);
    const a = await person('A');
    const b = await person('B');
    assert.deepEqual(await get(`/api/graph/path?personA=${a}&personB=${b}`), []);
    const relation = await get(`/api/graph/relationship?personA=${a}&personB=${b}`);
    assert.equal(relation.path.length, 0);
    assert.equal(relation.distance, null);

    const union = await requestJson(server.baseUrl, '/api/unions', {
      method: 'POST',
      body: { partnerIds: [a, b] },
    });
    assert.equal(union.status, 201);
    const spouse = await get(`/api/graph/path?personA=${a}&personB=${b}`);
    assert.deepEqual(
      spouse[0].map((step) => step.via),
      ['START', 'SPOUSE'],
    );

    for (const query of [
      `personA=${a}&personB=9999`,
      `personA=${a}&personB=${b}&depth=-1`,
      `personA=${a}&personB=${b}&limit=0`,
      `personA=${a}&personB=${b}&limit=abc`,
      `personA=x&personB=${b}`,
    ]) {
      const response = await requestJson(server.baseUrl, `/api/graph/path?${query}`);
      assert.ok([400, 404].includes(response.status), query);
    }
  } finally {
    await server.close();
  }
});

test('ancêtres communs : plus récents, anciens, soi-même, absence et profondeur', async () => {
  const server = await startTestServer();
  try {
    const { person, link, get } = await build(server);
    const arriere = await person('Arrière-grand-père', 'M');
    const grandPere = await person('Grand-père', 'M');
    const grandMere = await person('Grand-mère', 'F');
    const pereA = await person('Père A', 'M');
    const pereB = await person('Père B', 'M');
    const a = await person('A');
    const b = await person('B');
    const etranger = await person('Étranger');
    await link(grandPere, arriere, 'FATHER');
    for (const parent of [pereA, pereB]) {
      await link(parent, grandPere, 'FATHER');
      await link(parent, grandMere, 'MOTHER');
    }
    await link(a, pereA, 'FATHER');
    await link(b, pereB, 'FATHER');

    const common = await get(`/api/graph/common-ancestors?personA=${a}&personB=${b}`);
    // Cousins germains : grand-père et grand-mère (plus récents), arrière-grand-père (ancien).
    assert.deepEqual(
      common.map((c) => [c.person.id, c.lowest]),
      [
        [grandPere, true],
        [grandMere, true],
        [arriere, false],
      ],
    );
    assert.equal(common[0].generationFromA, 2);
    assert.equal(common[0].generationFromB, 2);
    assert.equal(common[0].branchFromA, 'PATERNAL');
    assert.equal(common[2].generationFromA, 3);

    // Une personne est l'ancêtre commun d'elle-même et de son descendant.
    const parentEtEnfant = await get(`/api/graph/common-ancestors?personA=${pereA}&personB=${a}`);
    const self = parentEtEnfant.find((c) => c.person.id === pereA);
    assert.equal(self.generationFromA, 0);
    assert.equal(self.generationFromB, 1);
    assert.equal(self.lowest, true);

    assert.deepEqual(await get(`/api/graph/common-ancestors?personA=${a}&personB=${etranger}`), []);
    const shallow = await get(`/api/graph/common-ancestors?personA=${a}&personB=${b}&depth=2`);
    assert.deepEqual(
      shallow.map((c) => c.person.id).sort((x, y) => x - y),
      [grandPere, grandMere].sort((x, y) => x - y),
    );
    const bad = await requestJson(
      server.baseUrl,
      `/api/graph/common-ancestors?personA=${a}&personB=${b}&depth=-3`,
    );
    assert.equal(bad.status, 400);
  } finally {
    await server.close();
  }
});

async function chain(server, length, sexes = []) {
  const { person, link } = await build(server);
  const ids = [];
  for (let i = 0; i <= length; i += 1) ids.push(await person(`P${i}`, sexes[i] ?? 'U'));
  for (let i = 0; i < length; i += 1) await link(ids[i], ids[i + 1], 'PARENT');
  return ids;
}

test('libellés d’ascendance et de descendance genrés, jusqu’aux générations lointaines', async () => {
  const server = await startTestServer();
  try {
    const { get } = await build(server);
    const ids = await chain(server, 6, ['U', 'M', 'F', 'M', 'F', 'M', 'F']);
    const label = async (a, b) =>
      (await get(`/api/graph/relationship?personA=${ids[a]}&personB=${ids[b]}`)).label;
    assert.equal(await label(0, 1), 'père');
    assert.equal(await label(0, 2), 'grand-mère');
    assert.equal(await label(0, 3), 'arrière-grand-père');
    assert.equal(await label(0, 4), 'arrière-arrière-grand-mère');
    assert.equal(await label(0, 6), 'ancêtre à la 6e génération');
    assert.equal(await label(1, 0), 'enfant');
    assert.equal(await label(2, 0), 'petit-enfant');
    assert.equal(await label(3, 0), 'arrière-petit-enfant');
    assert.equal(await label(6, 0), 'descendant à la 6e génération');
  } finally {
    await server.close();
  }
});

test('demi-fratrie, fratrie par alliance et cousinages nommés avec exactitude', async () => {
  const server = await startTestServer();
  try {
    const { person, link, get } = await build(server);
    const pere = await person('Père', 'M');
    const mere = await person('Mère', 'F');
    const autreMere = await person('Autre mère', 'F');
    const moi = await person('Moi');
    const demiFrere = await person('Demi-frère', 'M');
    const demiSoeur = await person('Demi-sœur', 'F');
    const beauFrere = await person('Frère par alliance', 'M');
    for (const [child, mother] of [
      [moi, mere],
      [demiFrere, autreMere],
      [demiSoeur, autreMere],
    ]) {
      await link(child, pere, 'FATHER');
      await link(child, mother, 'MOTHER');
    }
    await link(beauFrere, pere, 'FATHER', 'STEP');
    const rel = async (a, b) => get(`/api/graph/relationship?personA=${a}&personB=${b}`);
    assert.equal((await rel(moi, demiFrere)).label, 'demi-frère');
    assert.equal((await rel(moi, demiSoeur)).label, 'demi-sœur');
    assert.equal((await rel(moi, demiFrere)).siblingType, 'HALF_PATERNAL');
    const step = await rel(moi, beauFrere);
    assert.equal(step.label, 'frère par alliance');
    assert.equal(step.bond, 'STEP');

    // Cousins issus de germains (3×3) et « à la mode de Bretagne » (2×3).
    const racine = await person('Racine');
    const g1 = await person('G1');
    const g2 = await person('G2');
    const h1 = await person('H1');
    const h2 = await person('H2');
    const c1 = await person('C1', 'M');
    const c2 = await person('C2', 'F');
    const c3 = await person('C3', 'M');
    await link(g1, racine);
    await link(g2, racine);
    await link(h1, g1);
    await link(h2, g2);
    await link(c1, h1);
    await link(c2, h2);
    const mid = await person('Mid');
    await link(mid, g2);
    await link(c3, mid);
    assert.equal((await rel(c1, c3)).label, 'cousin issu de germain');
    assert.equal((await rel(c3, c1)).relationship, 'COLLATERAL');
    // c1 (3 générations sous racine) et c2 (3 aussi) : issus de germains.
    assert.equal((await rel(c2, c1)).label, 'cousin issu de germain');
    // H1 (2 sous racine) vs C2 (3 sous racine) : écart d'une génération.
    assert.equal((await rel(h1, c2)).label, 'nièce à la mode de Bretagne');
    assert.match((await rel(c2, h1)).label, /^oncle à la mode de Bretagne ou tante/);
  } finally {
    await server.close();
  }
});

test('belle-famille : beau-père, gendre / belle-fille, beau-frère / belle-sœur', async () => {
  const server = await startTestServer();
  try {
    const { person, link, get } = await build(server);
    const moi = await person('Moi');
    const conjointe = await person('Conjointe', 'F');
    const beauPere = await person('Beau-père', 'M');
    const soeurConjointe = await person('Sœur de la conjointe', 'F');
    const enfant = await person('Enfant');
    const brue = await person('Conjoint de l’enfant', 'F');
    const frere = await person('Frère', 'M');
    const epouseDuFrere = await person('Épouse du frère', 'F');
    const parent = await person('Parent', 'M');
    for (const [a, b] of [
      [moi, conjointe],
      [enfant, brue],
      [frere, epouseDuFrere],
    ]) {
      const union = await requestJson(server.baseUrl, '/api/unions', {
        method: 'POST',
        body: { partnerIds: [a, b] },
      });
      assert.equal(union.status, 201);
    }
    await link(conjointe, beauPere, 'FATHER');
    await link(soeurConjointe, beauPere, 'FATHER');
    await link(enfant, moi);
    await link(moi, parent, 'FATHER');
    await link(frere, parent, 'FATHER');
    const rel = (a, b) => get(`/api/graph/relationship?personA=${a}&personB=${b}`);
    assert.equal((await rel(moi, conjointe)).label, 'épouse');
    const bp = await rel(moi, beauPere);
    assert.equal(bp.relationship, 'IN_LAW');
    assert.equal(bp.label, 'beau-père');
    assert.equal(bp.bond, 'AFFINITY');
    assert.equal((await rel(moi, brue)).label, 'belle-fille');
    assert.equal((await rel(moi, soeurConjointe)).label, 'belle-sœur');
    assert.equal((await rel(moi, epouseDuFrere)).label, 'belle-sœur');
  } finally {
    await server.close();
  }
});

test('nature du lien : adoption, tutelle, lien inconnu et relations multiples', async () => {
  const server = await startTestServer();
  try {
    const { person, link, get } = await build(server);
    const enfant = await person('Enfant');
    const adoptant = await person('Adoptant', 'M');
    const grandAdoptant = await person('Parent de l’adoptant', 'F');
    const tuteur = await person('Tuteur', 'M');
    const inconnu = await person('Lien inconnu');
    await link(enfant, adoptant, 'FATHER', 'ADOPTIVE');
    await link(adoptant, grandAdoptant, 'MOTHER');
    await link(enfant, tuteur, 'PARENT', 'GUARDIAN');
    await link(enfant, inconnu, 'PARENT', 'UNKNOWN');
    const rel = (a, b) => get(`/api/graph/relationship?personA=${a}&personB=${b}`);

    const adopte = await rel(enfant, adoptant);
    assert.equal(adopte.label, 'père adoptif');
    assert.equal(adopte.bond, 'ADOPTIVE');
    const grand = await rel(enfant, grandAdoptant);
    assert.equal(grand.label, 'grand-mère');
    assert.equal(
      grand.bond,
      'ADOPTIVE',
      'la lignée adoptive reste signalée aux générations suivantes',
    );
    const legal = await rel(enfant, tuteur);
    assert.equal(legal.label, 'tuteur');
    assert.equal(legal.bond, 'STEP');
    assert.equal((await rel(tuteur, enfant)).label, 'pupille');
    const incertain = await rel(enfant, inconnu);
    assert.equal(incertain.bond, 'UNCERTAIN');
    assert.match(incertain.label, /non précisé/);
    // Sans lien de sang établi, aucun lien de consanguinité n'est affirmé.
    assert.equal(adopte.consanguinity, null);
  } finally {
    await server.close();
  }
});

test('cousins mariés : le mariage est la relation la plus courte, le lien de sang reste signalé', async () => {
  const server = await startTestServer();
  try {
    const { person, link, get } = await build(server);
    const grandPere = await person('Grand-père', 'M');
    const pereA = await person('Père A', 'M');
    const pereB = await person('Père B', 'M');
    const a = await person('A', 'M');
    const b = await person('B', 'F');
    await link(pereA, grandPere, 'FATHER');
    await link(pereB, grandPere, 'FATHER');
    await link(a, pereA, 'FATHER');
    await link(b, pereB, 'FATHER');
    await requestJson(server.baseUrl, '/api/unions', {
      method: 'POST',
      body: { partnerIds: [a, b] },
    });

    const relation = await get(`/api/graph/relationship?personA=${a}&personB=${b}`);
    assert.equal(relation.relationship, 'SPOUSE');
    assert.equal(relation.label, 'épouse');
    assert.equal(relation.distance, 1);
    assert.equal(relation.consanguinity.relationship, 'COLLATERAL');
    assert.equal(relation.consanguinity.label, 'cousine germaine');
    assert.deepEqual(relation.consanguinity.commonAncestorIds, [grandPere]);
    assert.equal(relation.consanguinity.up, 2);
  } finally {
    await server.close();
  }
});

test('relation : absence de lien, même personne, profondeur limitée', async () => {
  const server = await startTestServer();
  try {
    const { person, get } = await build(server);
    const a = await person('A');
    const b = await person('B');
    const none = await get(`/api/graph/relationship?personA=${a}&personB=${b}`);
    assert.equal(none.connected, false);
    assert.equal(none.relationship, null);
    assert.deepEqual(none.relationships, []);
    const same = await get(`/api/graph/relationship?personA=${a}&personB=${a}`);
    assert.equal(same.relationship, 'SELF');
    assert.equal(same.distance, 0);

    const ids = await chain(server, 4);
    const far = await get(`/api/graph/relationship?personA=${ids[0]}&personB=${ids[4]}`);
    assert.equal(far.relationship, 'ANCESTOR_4');
    assert.equal(far.connected, true);
    const limited = await get(
      `/api/graph/relationship?personA=${ids[0]}&personB=${ids[4]}&depth=3`,
    );
    assert.equal(limited.connected, false);
  } finally {
    await server.close();
  }
});

test('le moteur expose la détection de doublons potentiels, sans jamais fusionner', async () => {
  const server = await startTestServer();
  try {
    const { person } = await build(server);
    const first = await person('Jean');
    const second = await person('Jean');
    await person('Zacharie');
    for (const id of [first, second]) {
      await requestJson(server.baseUrl, '/api/events', {
        method: 'POST',
        body: {
          type: 'BIRTH',
          dateText: '1850',
          participants: [{ personId: id, role: 'PRINCIPAL' }],
        },
      });
    }
    const duplicates = server.services.graph.detectPotentialDuplicates();
    assert.equal(duplicates.total, 1);
    assert.equal(duplicates.items[0].requiresValidation, true);
    assert.equal(
      server.database.prepare('SELECT COUNT(*) AS n FROM persons WHERE deleted_at IS NULL').get().n,
      3,
    );
  } finally {
    await server.close();
  }
});

test('performance : relation et ancêtres communs sur 4 000 personnes restent instantanés', async () => {
  const server = await startTestServer();
  try {
    const db = server.database;
    const insertPerson = db.prepare(
      "INSERT INTO persons (given_names, family_name) VALUES (?, 'Perf')",
    );
    const insertLink = db.prepare(
      "INSERT INTO parentages (child_id, parent_id, parent_role) VALUES (?, ?, 'PARENT')",
    );
    // Arbre binaire complet de 12 générations (4 095 personnes), pères et mères.
    db.transaction(() => {
      for (let i = 1; i <= 4095; i += 1) insertPerson.run(`P${i}`);
      for (let i = 1; i <= 2047; i += 1) {
        insertLink.run(i, 2 * i);
        insertLink.run(i, 2 * i + 1);
      }
    })();
    const started = performance.now();
    const relation = server.services.graph.findRelationship(1, 4095);
    const common = server.services.graph.findCommonAncestors(1, 2);
    const elapsed = performance.now() - started;
    assert.ok(relation.connected);
    assert.ok(common.length > 0);
    assert.equal(relation.relationship, 'ANCESTOR_11');
    assert.ok(elapsed < 3000, `trop lent : ${Math.round(elapsed)} ms`);
  } finally {
    await server.close();
  }
});
