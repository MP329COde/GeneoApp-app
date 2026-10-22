import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { stopOcr } from '../../src/server/src/indexing/content-extract.js';
import { startTestServer, requestJson } from './helpers.js';
import { parseGedcom, validateGedcom } from '../../src/server/src/gedcom/index.js';

after(() => stopOcr());

const FILE = [
  '0 HEAD',
  '1 GEDC',
  '2 VERS 5.5.1',
  '0 @S1@ SOUR',
  '1 TITL Registre paroissial de Sainte-Anne',
  '1 AUTH Curé Martin',
  '1 PUBL Archives départementales, 1815',
  '0 @N1@ NOTE Note partagée',
  '1 CONT sur deux lignes',
  '0 @I1@ INDI',
  '1 NAME Ada /Lovelace/',
  '1 SEX F',
  '1 NOTE @N1@',
  '1 NOTE Remarque directe',
  '1 SOUR @S1@',
  '2 PAGE f. 12',
  '2 QUAY 3',
  '2 DATA',
  '3 TEXT né le dix décembre',
  '1 BIRT',
  '2 DATE 10 DEC 1815',
  '2 PLAC Londres',
  '3 MAP',
  '4 LATI N51.5072',
  '4 LONG W0.1276',
  '2 SOUR Registre en ligne',
  '3 QUAY 0',
  '0 @I2@ INDI',
  '1 NAME William /King/',
  '1 SEX M',
  '0 @F1@ FAM',
  '1 HUSB @I2@',
  '1 WIFE @I1@',
  '1 MARR',
  '2 TYPE civil partnership',
  '2 DATE 8 JUL 1835',
  '2 PLAC Londres',
  '2 NOTE Cérémonie civile',
  '1 DIV',
  '2 DATE 1850',
  '1 SOUR @S1@',
  '2 PAGE f. 99',
  '0 TRLR',
].join('\n');

const post = (server, path, body) => requestJson(server.baseUrl, path, { method: 'POST', body });

test('import : sources, notes partagées, citations, coordonnées et type d’union', async () => {
  const server = await startTestServer();
  try {
    const preview = await post(server, '/api/gedcom/preview', { gedcom: FILE });
    assert.deepEqual(preview.body.contents, { sources: 1, notes: 1, citations: 3 });
    assert.equal(server.database.prepare('SELECT COUNT(*) AS n FROM sources').get().n, 0);
    const imported = await post(server, '/api/gedcom/import', { gedcom: FILE });
    assert.equal(imported.status, 201, JSON.stringify(imported.body));
    assert.equal(imported.body.ids.sources.length, 2, 'un SOUR + une source en ligne');
    assert.equal(imported.body.ids.citations.length, 3);

    const db = server.database;
    const ada = db.prepare("SELECT * FROM persons WHERE given_names = 'Ada'").get();
    assert.equal(ada.notes, 'Note partagée\nsur deux lignes\nRemarque directe');

    const source = db
      .prepare("SELECT * FROM sources WHERE title LIKE 'Registre paroissial%'")
      .get();
    assert.equal(source.author, 'Curé Martin');
    assert.equal(source.publication_info, 'Archives départementales, 1815');

    const personCitation = db
      .prepare("SELECT * FROM citations WHERE entity_type = 'PERSON' AND entity_id = ?")
      .get(ada.id);
    assert.equal(personCitation.page, 'f. 12');
    assert.equal(personCitation.confidence, 'HIGH');
    assert.equal(personCitation.quotation, 'né le dix décembre');

    const eventCitation = db.prepare("SELECT * FROM citations WHERE entity_type = 'EVENT'").get();
    assert.equal(eventCitation.confidence, 'LOW');
    assert.equal(
      db.prepare('SELECT title FROM sources WHERE id = ?').get(eventCitation.source_id).title,
      'Registre en ligne',
    );

    const place = db.prepare("SELECT * FROM places WHERE name = 'Londres'").get();
    assert.equal(place.latitude, 51.5072);
    assert.equal(place.longitude, -0.1276);

    const union = db.prepare('SELECT * FROM unions').get();
    assert.equal(union.type, 'CIVIL_PARTNERSHIP');
    assert.equal(union.notes, null);
    assert.equal(
      db.prepare('SELECT notes FROM events WHERE id = ?').get(union.start_event_id).notes,
      'Cérémonie civile',
    );
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM citations WHERE entity_type = 'UNION'").get().n,
      1,
    );
  } finally {
    await server.close();
  }
});

test('export : sources, citations, notes, coordonnées, mariage et divorce font l’aller-retour', async () => {
  const origin = await startTestServer();
  const target = await startTestServer();
  try {
    await post(origin, '/api/gedcom/import', { gedcom: FILE });
    for (const format of ['5.5.1', '7']) {
      const exported = await post(origin, '/api/gedcom/export', { format });
      assert.equal(exported.status, 200);
      const text = exported.body.gedcom;
      assert.match(
        text,
        /0 @S\d+@ SOUR\n1 TITL Registre paroissial de Sainte-Anne\n1 AUTH Curé Martin/,
      );
      assert.match(text, /1 NOTE Note partagée\n2 CONT sur deux lignes\n2 CONT Remarque directe/);
      assert.match(text, /1 SOUR @S1@\n2 PAGE f\. 12\n2 QUAY 3\n2 DATA\n3 TEXT né le dix décembre/);
      assert.match(text, /3 MAP\n4 LATI N51\.5072\n4 LONG W0\.1276/);
      assert.match(text, /1 MARR\n2 TYPE civil partnership\n2 DATE 8 JUL 1835\n2 PLAC Londres/);
      assert.match(text, /1 DIV\n2 DATE 1850/);
      assert.equal(validateGedcom(parseGedcom(text)).valid, true);
    }

    // Réimport de l'export dans une base vierge : même contenu.
    const exported = (await post(origin, '/api/gedcom/export', { format: '5.5.1' })).body.gedcom;
    const reimported = await post(target, '/api/gedcom/import', { gedcom: exported });
    assert.equal(reimported.status, 201, JSON.stringify(reimported.body));
    const count = (db, sql) => db.prepare(sql).get().n;
    for (const sql of [
      'SELECT COUNT(*) AS n FROM persons',
      'SELECT COUNT(*) AS n FROM sources',
      "SELECT COUNT(*) AS n FROM citations WHERE entity_type = 'PERSON'",
      "SELECT COUNT(*) AS n FROM unions WHERE type = 'CIVIL_PARTNERSHIP'",
      'SELECT COUNT(*) AS n FROM places WHERE latitude IS NOT NULL',
      "SELECT COUNT(*) AS n FROM events WHERE type = 'DIVORCE'",
    ]) {
      assert.equal(count(target.database, sql), count(origin.database, sql), sql);
    }
  } finally {
    await origin.close();
    await target.close();
  }
});

const WITH_UNKNOWN = [
  '0 HEAD',
  '1 GEDC',
  '2 VERS 5.5.1',
  '0 @I1@ INDI',
  '1 NAME Ada /Lovelace/',
  '1 _MILT Y',
  '2 _RANK Capitaine',
  '1 ASSO @I2@',
  '2 RELA Parrain',
  '1 ASSO @I77@',
  '1 CHAN',
  '2 DATE 1 JAN 2020',
  '1 EVEN Poète',
  '2 TYPE Honneur',
  '2 DATE 1840',
  '1 BIRT',
  '2 DATE 1815',
  '2 AGE 0y',
  '2 CAUS prématurée',
  '0 @I2@ INDI',
  '1 NAME William /King/',
  '0 @F1@ FAM',
  '1 HUSB @I2@',
  '1 WIFE @I1@',
  '1 ENGA',
  '2 DATE 1834',
  '1 MARR',
  '2 DATE 1835',
  '2 AGNC Mairie',
  '0 TRLR',
].join('\n');

test('balises inconnues : signalées à l’aperçu, conservées, rendues à l’export au même rang', async () => {
  const origin = await startTestServer();
  const target = await startTestServer();
  try {
    const preview = await post(origin, '/api/gedcom/preview', { gedcom: WITH_UNKNOWN });
    const unmapped = Object.fromEntries(
      preview.body.unmapped.map((item) => [`${item.where}:${item.tag}`, item.count]),
    );
    assert.deepEqual(unmapped, {
      'INDI:_MILT': 1,
      'INDI:ASSO': 2,
      'INDI:CHAN': 1,
      'INDI:EVEN': 1,
      'EVENT:AGE': 1,
      'EVENT:CAUS': 1,
      'FAM:ENGA': 1,
      'EVENT:AGNC': 1,
    });

    const imported = await post(origin, '/api/gedcom/import', { gedcom: WITH_UNKNOWN });
    assert.equal(imported.status, 201);
    assert.equal(imported.body.ids.extensions.length, 9);
    assert.equal(origin.database.prepare('SELECT COUNT(*) AS n FROM gedcom_extensions').get().n, 9);

    for (const format of ['5.5.1', '7']) {
      const text = (await post(origin, '/api/gedcom/export', { format })).body.gedcom;
      assert.match(text, /1 _MILT Y\n2 _RANK Capitaine/);
      assert.match(text, /1 EVEN Poète\n2 TYPE Honneur\n2 DATE 1840/);
      assert.match(text, /1 CHAN\n2 DATE 1 JAN 2020/);
      assert.match(text, /2 AGE 0y\n/);
      assert.match(text, /1 ENGA\n2 DATE 1834/);
      assert.match(text, /2 AGNC Mairie/);
      // Le pointeur vers une personne importée suit son nouvel identifiant ;
      // celui qui ne désigne rien est vidé (jamais de référence orpheline).
      const william = origin.database
        .prepare("SELECT id FROM persons WHERE given_names = 'William'")
        .get();
      assert.match(text, new RegExp(`1 ASSO @I${william.id}@\\n2 RELA Parrain`));
      assert.doesNotMatch(text, /@I77@/);
      assert.equal(validateGedcom(parseGedcom(text)).valid, true);
    }

    // Les extensions survivent à un second import de l'export.
    const exported = (await post(origin, '/api/gedcom/export', { format: '5.5.1' })).body.gedcom;
    await post(target, '/api/gedcom/import', { gedcom: exported });
    assert.equal(target.database.prepare('SELECT COUNT(*) AS n FROM gedcom_extensions').get().n, 9);
  } finally {
    await origin.close();
    await target.close();
  }
});
