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
