import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, test } from 'node:test';
import { stopOcr } from '../../src/server/src/indexing/content-extract.js';

after(() => stopOcr());
import { startTestServer, requestJson } from './helpers.js';
import { parseGedcom, validateGedcom } from '../../src/server/src/gedcom/index.js';

// Normalisé en LF : les tests remplacent des fragments de texte (indépendant de l'OS).
const fixture = (
  await readFile(new URL('../fixtures/sample.ged', import.meta.url), 'utf8')
).replace(/\r\n/g, '\n');

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

    const eventRows = server.database
      .prepare(
        `SELECT type, value FROM events e
         JOIN event_participants ep ON ep.event_id = e.id
         WHERE ep.person_id = ? ORDER BY e.id`,
      )
      .all(imported.body.ids.persons[0]);
    assert.deepEqual(
      eventRows.map((row) => row.type),
      ['BIRTH', 'OCCUPATION', 'NATURALIZATION'],
    );
    // La valeur métier portée par la ligne du tag lui-même (« 1 OCCU Mathématicienne »)
    // doit être conservée, pas seulement le type d'événement.
    assert.equal(eventRows.find((row) => row.type === 'OCCUPATION').value, 'Mathématicienne');

    const exported = await requestJson(server.baseUrl, '/api/gedcom/export', {
      method: 'POST',
      body: { format: '7' },
    });
    assert.match(exported.body.gedcom, /1 OCCU Mathématicienne/);
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

test('GEDCOM conserve les dates estimées/calculées et les types migration, succession, engagement religieux', async () => {
  const server = await startTestServer();
  try {
    const gedcom = fixture.replace(
      '1 BIRT\n2 DATE 10 DEC 1815\n2 PLAC London',
      [
        '1 BIRT\n2 DATE EST 1815\n2 PLAC London',
        '1 EVEN\n2 TYPE Migration\n2 DATE CAL 1830',
        '1 EVEN\n2 TYPE Succession\n2 DATE 1852',
        '1 EVEN\n2 TYPE Religious commitment\n2 DATE 1840',
      ].join('\n'),
    );
    const imported = await requestJson(server.baseUrl, '/api/gedcom/import', {
      method: 'POST',
      body: { gedcom },
    });
    assert.equal(imported.status, 201);

    const rows = server.database
      .prepare(
        `SELECT e.type, e.date_precision AS precision FROM events e
         JOIN event_participants ep ON ep.event_id = e.id
         WHERE ep.person_id = ? ORDER BY e.id`,
      )
      .all(imported.body.ids.persons[0]);
    assert.deepEqual(rows, [
      { type: 'BIRTH', precision: 'ESTIMATED' },
      { type: 'MIGRATION', precision: 'CALCULATED' },
      { type: 'SUCCESSION', precision: 'EXACT' },
      { type: 'RELIGIOUS_COMMITMENT', precision: 'EXACT' },
    ]);

    const exported = await requestJson(server.baseUrl, '/api/gedcom/export', {
      method: 'POST',
      body: { format: '5.5.1' },
    });
    assert.match(exported.body.gedcom, /2 DATE EST 1815/);
    assert.match(exported.body.gedcom, /1 EVEN\n2 TYPE Migration\n2 DATE CAL 1830/);
    assert.match(exported.body.gedcom, /1 EVEN\n2 TYPE Succession/);
    assert.match(exported.body.gedcom, /1 EVEN\n2 TYPE Religious commitment/);
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

test('GEDZIP : export avec médias puis import dans un arbre vide rattache les fichiers', async () => {
  const source = await startTestServer();
  const target = await startTestServer();
  try {
    const png = await readFile(new URL('../fixtures/sample.png', import.meta.url));
    const { body: person } = await requestJson(source.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: 'Ada', familyName: 'Lovelace' },
    });
    const upload = await requestJson(source.baseUrl, '/api/media', {
      method: 'POST',
      body: {
        filename: 'portrait Ada.png',
        contentBase64: png.toString('base64'),
        entityType: 'PERSON',
        entityId: person.id,
      },
    });
    assert.equal(upload.status, 201);

    const plain = await requestJson(source.baseUrl, '/api/gedcom/export', {
      method: 'POST',
      body: { format: '7' },
    });
    assert.match(plain.body.gedcom, /1 OBJE @O\d+@/);
    assert.match(plain.body.gedcom, /1 FILE media\/\d+-portrait_Ada\.png/);
    assert.match(plain.body.gedcom, /2 FORM image\/png/);

    const archive = await requestJson(source.baseUrl, '/api/gedcom/export-archive', {
      method: 'POST',
      body: {},
    });
    assert.equal(archive.status, 200);
    assert.equal(archive.body.summary.media, 1);

    const imported = await requestJson(target.baseUrl, '/api/gedcom/import-archive', {
      method: 'POST',
      body: { contentBase64: archive.body.contentBase64 },
    });
    assert.equal(imported.status, 201);
    assert.equal(imported.body.media.attached, 1);
    assert.deepEqual(imported.body.media.rejected, []);

    const [importedPerson] = (await requestJson(target.baseUrl, '/api/persons')).body;
    const media = await requestJson(
      target.baseUrl,
      `/api/media/by-entity/PERSON/${importedPerson.id}`,
    );
    assert.equal(media.body.length, 1);
    assert.equal(media.body[0].mime_type, 'image/png');
  } finally {
    await source.close();
    await target.close();
  }
});

test('GEDZIP : refuse une archive sans .ged ou invalide', async () => {
  const server = await startTestServer();
  try {
    const { createZip } = await import('../../src/server/src/gedcom/zip.js');
    const noGed = createZip([{ name: 'photo.png', content: Buffer.from('x') }]);
    const missing = await requestJson(server.baseUrl, '/api/gedcom/import-archive', {
      method: 'POST',
      body: { contentBase64: noGed.toString('base64') },
    });
    assert.equal(missing.status, 400);
    const garbage = await requestJson(server.baseUrl, '/api/gedcom/import-archive', {
      method: 'POST',
      body: { contentBase64: Buffer.from('pas un zip').toString('base64') },
    });
    assert.equal(garbage.status, 400);
  } finally {
    await server.close();
  }
});

test('aller-retour GEDCOM fidèle : filiations sans union, enfant unique par famille, adoption', async () => {
  const source = await startTestServer();
  const target = await startTestServer();
  try {
    const person = async (givenNames, familyName, sex) =>
      (
        await requestJson(source.baseUrl, '/api/persons', {
          method: 'POST',
          body: { givenNames, familyName, sex },
        })
      ).body;
    const ada = await person('Ada', 'Lovelace', 'F');
    const charles = await person('Charles', 'Babbage', 'M');
    const byron = await person('Byron', 'Lovelace', 'M');
    const adopte = await person('Adopté', 'Lovelace', 'U');
    const { body: union } = await requestJson(source.baseUrl, '/api/unions', {
      method: 'POST',
      body: { type: 'MARRIAGE', partnerIds: [ada.id, charles.id] },
    });
    for (const [parent, role] of [
      [ada, 'MOTHER'],
      [charles, 'FATHER'],
    ]) {
      await requestJson(source.baseUrl, '/api/parentages', {
        method: 'POST',
        body: { childId: byron.id, parentId: parent.id, parentRole: role, unionId: union.id },
      });
    }
    await requestJson(source.baseUrl, '/api/parentages', {
      method: 'POST',
      body: { childId: adopte.id, parentId: ada.id, parentRole: 'MOTHER', linkType: 'ADOPTIVE' },
    });

    const { body: exported } = await requestJson(source.baseUrl, '/api/gedcom/export', {
      method: 'POST',
      body: { format: '7' },
    });
    const chil = exported.gedcom.match(new RegExp(`1 CHIL @I${byron.id}@`, 'g'));
    assert.equal(chil.length, 1, 'un enfant n’apparaît qu’une fois dans sa famille');
    assert.match(exported.gedcom, new RegExp(`1 HUSB @I${charles.id}@`));
    assert.match(exported.gedcom, new RegExp(`1 WIFE @I${ada.id}@`));
    assert.match(exported.gedcom, /2 PEDI ADOPTED/);
    assert.match(exported.gedcom, /1 _NOUNION Y/);

    const imported = await requestJson(target.baseUrl, '/api/gedcom/import', {
      method: 'POST',
      body: { gedcom: exported.gedcom },
    });
    assert.equal(imported.status, 201, JSON.stringify(imported.body).slice(0, 300));
    assert.equal(
      imported.body.ids.unions.length,
      1,
      'aucune union inventée pour la filiation seule',
    );
    assert.equal(imported.body.ids.parentages.length, 3);

    const newIds = imported.body.personXrefs;
    const adopted = await requestJson(
      target.baseUrl,
      `/api/parentages/parents-of/${newIds[`@I${adopte.id}@`]}`,
    );
    assert.equal(adopted.body.length, 1);
    assert.equal(adopted.body[0].link_type, 'ADOPTIVE');
    assert.equal(adopted.body[0].parent_role, 'MOTHER');
    assert.equal(adopted.body[0].union_id, null);
  } finally {
    await source.close();
    await target.close();
  }
});

// L'import écrit en SQL direct, sans passer par les dépôts métier : l'index
// de recherche locale n'était donc pas alimenté, et les personnes importées
// restaient introuvables par la recherche.
test('GEDCOM import alimente la recherche locale', async () => {
  const server = await startTestServer();
  try {
    const imported = await requestJson(server.baseUrl, '/api/gedcom/import', {
      method: 'POST',
      body: { gedcom: fixture },
    });
    assert.equal(imported.status, 201);

    const persons = server.database.prepare('SELECT COUNT(*) AS count FROM persons').get().count;
    const indexed = server.database
      .prepare("SELECT COUNT(*) AS count FROM search_index WHERE entity_type = 'PERSON'")
      .get().count;
    assert.equal(indexed, persons, 'chaque personne importée doit être indexée');

    // Une personne importée est retrouvée par la recherche locale. Le prénom
    // est choisi car la fixture porte deux personnes de même nom de famille
    // (Lovelace) : c'est l'indexation complète, et non une correspondance
    // partielle, qui est vérifiée ici.
    const givenName = server.database
      .prepare('SELECT given_names FROM persons ORDER BY id LIMIT 1')
      .get().given_names;
    const found = await requestJson(
      server.baseUrl,
      `/api/search?q=${encodeURIComponent(givenName)}&entityTypes=PERSON`,
    );
    assert.equal(found.status, 200);
    assert.equal(found.body.length, 1);
    assert.equal(found.body[0].entity_type, 'PERSON');
  } finally {
    await server.close();
  }
});

test('export : en-tête conforme, relu et vérifié ; un retour à la ligne dans un nom ne casse pas le fichier', async () => {
  const server = await startTestServer();
  try {
    const empty = await requestJson(server.baseUrl, '/api/gedcom/export', {
      method: 'POST',
      body: { format: '5.5.1' },
    });
    assert.equal(empty.status, 200, 'un arbre vide s’exporte aussi');
    assert.equal(empty.body.summary.verified, true);
    assert.match(
      empty.body.gedcom,
      /^0 HEAD\n1 SOUR GeneoApp\n2 NAME GeneoApp\n1 GEDC\n2 VERS 5\.5\.1\n2 FORM LINEAGE-LINKED\n1 CHAR UTF-8\n1 SUBM @SUBM1@/,
    );

    const hostile = await requestJson(server.baseUrl, '/api/persons', {
      method: 'POST',
      body: {
        givenNames: 'Ada\n0 TRLR\n0 @I999@ INDI',
        familyName: 'Lovelace\r\n1 SEX M',
        notes: 'ligne 1\nligne 2',
      },
    });
    assert.equal(hostile.status, 201);

    for (const format of ['5.5.1', '7']) {
      const exported = await requestJson(server.baseUrl, '/api/gedcom/export', {
        method: 'POST',
        body: { format },
      });
      assert.equal(exported.status, 200);
      assert.equal(exported.body.summary.persons, 1);
      const records = parseGedcom(exported.body.gedcom);
      assert.equal(records.filter((record) => record.tag === 'INDI').length, 1, format);
      assert.equal(records.filter((record) => record.tag === 'TRLR').length, 1, format);
      if (format === '7') {
        assert.match(exported.body.gedcom, /2 VERS 7\.0/);
        assert.doesNotMatch(exported.body.gedcom, /1 CHAR/);
      }
    }
  } finally {
    await server.close();
  }
});

test('import par octets bruts : ANSI, ANSEL, UTF-16 et fins de ligne CR seul, encodage rapporté', async () => {
  const server = await startTestServer();
  try {
    const text = (charset, eol = '\n') =>
      [
        '0 HEAD',
        '1 GEDC',
        '2 VERS 5.5.1',
        `1 CHAR ${charset}`,
        '0 @I1@ INDI',
        '1 NAME Zoé /Léger/',
        '0 TRLR',
      ].join(eol) + eol;
    const files = [
      ['WINDOWS-1252', Buffer.from(text('ANSI'), 'latin1')],
      [
        'UTF-16LE',
        Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text('UNICODE'), 'utf16le')]),
      ],
      ['UTF-8', Buffer.from(text('UTF-8', '\r'), 'utf8')],
      [
        'ANSEL',
        Buffer.concat([
          Buffer.from('0 HEAD\n1 GEDC\n2 VERS 5.5.1\n1 CHAR ANSEL\n0 @I1@ INDI\n1 NAME Zo'),
          Buffer.from([0xe2, 0x65]),
          Buffer.from(' /L'),
          Buffer.from([0xe2, 0x65]),
          Buffer.from('ger/\n0 TRLR\n'),
        ]),
      ],
    ];
    for (const [encoding, buffer] of files) {
      const preview = await requestJson(server.baseUrl, '/api/gedcom/preview', {
        method: 'POST',
        body: { gedcomBase64: buffer.toString('base64') },
      });
      assert.equal(preview.status, 200, encoding);
      assert.equal(preview.body.encoding, encoding);
      assert.equal(preview.body.valid, true, encoding);

      const imported = await requestJson(server.baseUrl, '/api/gedcom/import', {
        method: 'POST',
        body: { gedcomBase64: buffer.toString('base64'), confirmDuplicates: true },
      });
      assert.equal(imported.status, 201, encoding);
      const person = server.database
        .prepare('SELECT given_names, family_name FROM persons WHERE id = ?')
        .get(imported.body.ids.persons[0]);
      assert.deepEqual(person, { given_names: 'Zoé', family_name: 'Léger' }, encoding);
    }
  } finally {
    await server.close();
  }
});

test('pipeline : doublons probables signalés à l’aperçu, import refusé sans confirmation, jamais de fusion', async () => {
  const server = await startTestServer();
  try {
    const first = await requestJson(server.baseUrl, '/api/gedcom/import', {
      method: 'POST',
      body: { gedcom: fixture },
    });
    assert.equal(first.status, 201);
    const count = () => server.database.prepare('SELECT COUNT(*) AS n FROM persons').get().n;
    assert.equal(count(), 3);

    const preview = await requestJson(server.baseUrl, '/api/gedcom/preview', {
      method: 'POST',
      body: { gedcom: fixture },
    });
    assert.equal(preview.body.valid, true);
    assert.equal(preview.body.duplicateCount, 3);
    assert.ok(
      preview.body.duplicates.some((d) => d.name === 'Ada Lovelace' && d.birthYear === 1815),
    );
    assert.ok(preview.body.duplicates.every((d) => d.reason === 'SAME_REFERENCE_AND_NAME'));

    const refused = await requestJson(server.baseUrl, '/api/gedcom/import', {
      method: 'POST',
      body: { gedcom: fixture },
    });
    assert.equal(refused.status, 409);
    assert.equal(refused.body.requiresConfirmation, true);
    assert.equal(refused.body.imported, false);
    assert.equal(count(), 3, 'rien n’est écrit sans confirmation');

    const confirmed = await requestJson(server.baseUrl, '/api/gedcom/import', {
      method: 'POST',
      body: { gedcom: fixture, confirmDuplicates: true },
    });
    assert.equal(confirmed.status, 201);
    assert.equal(confirmed.body.duplicatesConfirmed, 3);
    assert.equal(count(), 6, 'l’import confirmé ajoute, il ne fusionne ni n’écrase rien');

    // Un homonyme né à une autre époque n'est pas signalé.
    const other = fixture.replace('10 DEC 1815', '10 DEC 1700');
    const homonym = await requestJson(server.baseUrl, '/api/gedcom/preview', {
      method: 'POST',
      body: { gedcom: other.replaceAll('@I', '@X').replaceAll('@F1@', '@Y1@') },
    });
    assert.ok(!homonym.body.duplicates.some((d) => d.name === 'Ada Lovelace'));
  } finally {
    await server.close();
  }
});

test('rollback intégral : un fichier incohérent n’écrit rien et répond 400, pas 500', async () => {
  const server = await startTestServer();
  try {
    const selfParent = [
      '0 HEAD',
      '1 GEDC',
      '2 VERS 5.5.1',
      '0 @I1@ INDI',
      '1 NAME Valide /Personne/',
      '1 BIRT',
      '2 DATE 1900',
      '0 @I2@ INDI',
      '1 NAME Son /Propre-parent/',
      '0 @F1@ FAM',
      '1 HUSB @I2@',
      '1 CHIL @I2@',
      '0 TRLR',
    ].join('\n');
    const result = await requestJson(server.baseUrl, '/api/gedcom/import', {
      method: 'POST',
      body: { gedcom: selfParent },
    });
    assert.equal(result.status, 400);
    assert.match(result.body.error.message, /aucune donnée écrite/);
    for (const table of [
      'persons',
      'events',
      'event_participants',
      'unions',
      'parentages',
      'places',
    ]) {
      assert.equal(
        server.database.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n,
        0,
        `${table} doit rester vide`,
      );
    }
    assert.equal(server.database.prepare('SELECT COUNT(*) AS n FROM search_index_map').get().n, 0);
  } finally {
    await server.close();
  }
});
