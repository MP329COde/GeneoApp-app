import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { startTestServer, requestJson } from './helpers.js';
import { parseGedcom, validateGedcom } from '../../src/server/src/gedcom/index.js';

const fixture = await readFile(new URL('../fixtures/sample.ged', import.meta.url), 'utf8');

test('le parser accepte GEDCOM 5.5, 5.5.1 et 7', () => {
  for (const version of ['5.5', '5.5.1', '7']) {
    const records = parseGedcom(fixture.replace('5.5.1', version));
    const report = validateGedcom(records);
    assert.equal(report.valid, true);
    assert.equal(report.version, version);
  }
});

test('GEDCOM preview ne modifie pas la base et retourne le rapport de mapping', async () => {
  const server = await startTestServer();
  try {
    const result = await requestJson(server.baseUrl, '/api/gedcom/preview', {
      method: 'POST',
      body: { gedcom: fixture },
    });

    assert.equal(result.status, 200);
    assert.equal(result.body.valid, true);
    assert.deepEqual(result.body.mapping, { persons: 3, events: 2, unions: 1, parentages: 2 });
    assert.equal(server.database.prepare('SELECT COUNT(*) AS count FROM persons').get().count, 0);
  } finally {
    await server.close();
  }
});

test('GEDCOM import mappe les entités dans une transaction', async () => {
  const server = await startTestServer();
  try {
    const result = await requestJson(server.baseUrl, '/api/gedcom/import', {
      method: 'POST',
      headers: { 'x-geneoapp-actor': 'gedcom-test' },
      body: { gedcom: fixture },
    });

    assert.equal(result.status, 201);
    assert.equal(result.body.imported, true);
    assert.equal(server.database.prepare('SELECT COUNT(*) AS count FROM persons').get().count, 3);
    assert.equal(
      server.database.prepare('SELECT COUNT(*) AS count FROM parentages').get().count,
      2,
    );
    assert.equal(
      server.database.prepare('SELECT COUNT(*) AS count FROM audit_log').get().count > 0,
      true,
    );
  } finally {
    await server.close();
  }
});

test('GEDCOM import persiste le surnom (NICK) et l’identifiant externe (xref), réexportés à l’identique', async () => {
  const server = await startTestServer();
  try {
    const gedcomWithNick = [
      '0 HEAD',
      '1 GEDC',
      '2 VERS 5.5.1',
      '0 @I1@ INDI',
      '1 NAME Ada /Lovelace/',
      '1 NICK Lady A',
      '1 SEX F',
      '0 TRLR',
    ].join('\n');

    const imported = await requestJson(server.baseUrl, '/api/gedcom/import', {
      method: 'POST',
      body: { gedcom: gedcomWithNick },
    });
    assert.equal(imported.status, 201);

    const person = server.database
      .prepare('SELECT * FROM persons WHERE given_names = ?')
      .get('Ada');
    assert.equal(person.nickname, 'Lady A');
    assert.equal(person.external_id, '@I1@');

    const exported = await requestJson(server.baseUrl, '/api/gedcom/export', {
      method: 'POST',
      body: { format: '5.5.1' },
    });
    assert.equal(exported.status, 200);
    assert.match(exported.body.gedcom, /1 NICK Lady A/);
  } finally {
    await server.close();
  }
});

test('GEDCOM invalide retourne le rapport sans écrire', async () => {
  const server = await startTestServer();
  try {
    const result = await requestJson(server.baseUrl, '/api/gedcom/import', {
      method: 'POST',
      body: { gedcom: fixture.replace('2 VERS 5.5.1', '2 VERS 4.0').replace('@I2@', '@I9@') },
    });

    assert.equal(result.status, 422);
    assert.equal(result.body.imported, false);
    assert.equal(server.database.prepare('SELECT COUNT(*) AS count FROM persons').get().count, 0);
  } finally {
    await server.close();
  }
});

test('GEDCOM exporte un arbre local et permet de sélectionner les ancêtres', async () => {
  const server = await startTestServer();
  try {
    const imported = await requestJson(server.baseUrl, '/api/gedcom/import', {
      method: 'POST',
      body: { gedcom: fixture },
    });
    assert.equal(imported.status, 201);

    const all = await requestJson(server.baseUrl, '/api/gedcom/export', {
      method: 'POST',
      body: { format: '7' },
    });
    assert.equal(all.status, 200);
    assert.equal(all.body.format, '7');
    assert.equal(all.body.summary.persons, 3);
    assert.match(all.body.gedcom, /0 @I1@ INDI/);
    assert.match(all.body.gedcom, /0 @F1@ FAM/);

    const ancestors = await requestJson(server.baseUrl, '/api/gedcom/export', {
      method: 'POST',
      body: { format: '5.5.1', ancestorsOf: 3 },
    });
    assert.equal(ancestors.status, 200);
    assert.equal(ancestors.body.summary.persons, 3);
    assert.match(ancestors.body.gedcom, /2 VERS 5.5.1/);
  } finally {
    await server.close();
  }
});

test('GEDCOM importe et réexporte les événements étendus (profession, migration, naturalisation...)', async () => {
  const server = await startTestServer();
  try {
    const extended = fixture.replace(
      '1 BIRT\n2 DATE 10 DEC 1815\n2 PLAC London',
      '1 BIRT\n2 DATE 10 DEC 1815\n2 PLAC London\n1 OCCU Mathématicienne\n1 NATU\n2 DATE 1840',
    );
    const imported = await requestJson(server.baseUrl, '/api/gedcom/import', {
      method: 'POST',
      body: { gedcom: extended },
    });
    assert.equal(imported.status, 201);

    const types = server.database
      .prepare(
        `SELECT type FROM events e
         JOIN event_participants ep ON ep.event_id = e.id
         WHERE ep.person_id = ? ORDER BY e.id`,
      )
      .all(imported.body.ids.persons[0])
      .map((row) => row.type);
    assert.deepEqual(types, ['BIRTH', 'OCCUPATION', 'NATURALIZATION']);

    const exported = await requestJson(server.baseUrl, '/api/gedcom/export', {
      method: 'POST',
      body: { format: '7' },
    });
    assert.match(exported.body.gedcom, /1 OCCU/);
    assert.match(exported.body.gedcom, /1 NATU/);
  } finally {
    await server.close();
  }
});

test('GEDCOM importe et réexporte un événement militaire via le tag générique EVEN/TYPE', async () => {
  const server = await startTestServer();
  try {
    const withMilitaryEvent = fixture.replace(
      '1 BIRT\n2 DATE 10 DEC 1815\n2 PLAC London',
      '1 BIRT\n2 DATE 10 DEC 1815\n2 PLAC London\n1 EVEN\n2 TYPE Military\n2 DATE 1835',
    );
    const imported = await requestJson(server.baseUrl, '/api/gedcom/import', {
      method: 'POST',
      body: { gedcom: withMilitaryEvent },
    });
    assert.equal(imported.status, 201);

    const types = server.database
      .prepare(
        `SELECT type FROM events e
         JOIN event_participants ep ON ep.event_id = e.id
         WHERE ep.person_id = ? ORDER BY e.id`,
      )
      .all(imported.body.ids.persons[0])
      .map((row) => row.type);
    assert.deepEqual(types, ['BIRTH', 'MILITARY']);

    const exported = await requestJson(server.baseUrl, '/api/gedcom/export', {
      method: 'POST',
      body: { format: '5.5.1' },
    });
    assert.match(exported.body.gedcom, /1 EVEN\n2 TYPE Military/);
  } finally {
    await server.close();
  }
});

async function createFamilyTree(baseUrl) {
  const person = async (givenNames, familyName, sex = 'U') =>
    (
      await requestJson(baseUrl, '/api/persons', {
        method: 'POST',
        body: { givenNames, familyName, sex },
      })
    ).body;
  const link = (child, parent, parentRole) =>
    requestJson(baseUrl, '/api/parentages', {
      method: 'POST',
      body: { childId: child.id, parentId: parent.id, parentRole },
    });
  const jean = await person('Jean', 'Centre', 'M');
  const pere = await person('Pierre', 'Paternel', 'M');
  const mere = await person('Anne', 'Maternel', 'F');
  const grandPere = await person('Jacques', 'Paternel', 'M');
  const enfant = await person('Paul', 'Centre', 'M');
  const inconnu = await person('Hors', 'Perimetre');
  await link(jean, pere, 'FATHER');
  await link(jean, mere, 'MOTHER');
  await link(pere, grandPere, 'FATHER');
  await link(enfant, jean, 'FATHER');
  return { jean, pere, mere, grandPere, enfant, inconnu };
}

function exportedNames(gedcom) {
  return [...gedcom.matchAll(/^1 NAME (.+)$/gm)].map((match) => match[1]).sort();
}

test('POST /api/gedcom/export respecte le périmètre (ancêtres, descendants, branche, personne)', async () => {
  const server = await startTestServer();
  try {
    const tree = await createFamilyTree(server.baseUrl);
    const exportWith = async (body) =>
      (await requestJson(server.baseUrl, '/api/gedcom/export', { method: 'POST', body })).body;

    const ancestors = await exportWith({ ancestorsOf: tree.jean.id });
    assert.equal(ancestors.summary.persons, 4);
    assert.ok(!exportedNames(ancestors.gedcom).some((name) => name.includes('Perimetre')));

    const descendants = await exportWith({ descendantsOf: tree.jean.id });
    assert.equal(descendants.summary.persons, 2);

    const paternal = await exportWith({ branchOf: tree.jean.id, side: 'PATERNAL' });
    assert.deepEqual(exportedNames(paternal.gedcom), ['Jacques /Paternel/', 'Pierre /Paternel/']);

    const maternal = await exportWith({ branchOf: tree.jean.id, side: 'MATERNAL' });
    assert.deepEqual(exportedNames(maternal.gedcom), ['Anne /Maternel/']);

    const single = await exportWith({ personOnly: tree.inconnu.id, format: '5.5.1' });
    assert.equal(single.summary.persons, 1);

    const complete = await exportWith({});
    assert.equal(complete.summary.persons, 6);
  } finally {
    await server.close();
  }
});

test('POST /api/gedcom/export refuse un format ou un périmètre invalide (400, pas 500)', async () => {
  const server = await startTestServer();
  try {
    for (const body of [
      { format: '6' },
      { ancestorsOf: 'abc' },
      { branchOf: 1, side: 'GAUCHE' },
      { personIds: 'tout' },
    ]) {
      const { status } = await requestJson(server.baseUrl, '/api/gedcom/export', {
        method: 'POST',
        body,
      });
      assert.equal(status, 400, JSON.stringify(body));
    }
  } finally {
    await server.close();
  }
});
