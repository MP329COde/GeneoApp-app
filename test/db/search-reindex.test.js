import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTestDatabase } from './helpers.js';
import { PersonRepository } from '../../src/db/src/repositories/person-repository.js';
import { SourceRepository } from '../../src/db/src/repositories/source-repository.js';
import { MediaRepository } from '../../src/db/src/repositories/media-repository.js';
import { reindexAll } from '../../src/db/src/repositories/search-reindex.js';

test('la réindexation reconstruit l’index à l’identique du dépôt métier', () => {
  const database = createTestDatabase();
  const persons = new PersonRepository(database);
  const sources = new SourceRepository(database);
  const media = new MediaRepository(database);

  persons.create({
    givenNames: 'Ada',
    familyName: 'Lovelace',
    birthFamilyName: 'Byron',
    nickname: 'La comtesse',
    notes: 'Pionnière du COBOL',
  });
  sources.create({ title: 'Registre paroissial', author: 'Curé', publicationInfo: '1840' });
  media.create({
    originalFilename: 'acte.png',
    storedFilename: 'stocke-acte.png',
    mimeType: 'image/png',
    sizeBytes: 1024,
    checksumSha256: 'c'.repeat(64),
  });

  // L'ordre des lignes n'a pas de sens pour un index FTS (la recherche est
  // classée par pertinence) : c'est le contenu indexé qui doit être
  // identique, pas la position des lignes.
  const byContent = (rows) =>
    [...rows].sort((a, b) =>
      `${a.entity_type}:${a.entity_id}`.localeCompare(`${b.entity_type}:${b.entity_id}`),
    );

  const before = byContent(
    database.prepare('SELECT entity_type, entity_id, title, body FROM search_index').all(),
  );

  const report = reindexAll(database);

  assert.equal(report.indexed, before.length);
  const after = byContent(
    database.prepare('SELECT entity_type, entity_id, title, body FROM search_index').all(),
  );

  // Le contenu indexé ne doit pas changer : une réindexation ne doit pas
  // modifier les résultats de recherche.
  assert.deepEqual(after, before);
});

test('la réindexation réinsère les fiches écrites hors des dépôts métier', () => {
  const database = createTestDatabase();

  // Écriture directe, comme le fait l'import GEDCOM : l'index n'est pas
  // alimenté, la fiche est donc invisible à la recherche.
  const person = database
    .prepare("INSERT INTO persons (given_names, family_name, sex) VALUES ('Byron', 'King', 'M')")
    .run();

  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM search_index').get().n, 0);

  reindexAll(database);

  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM search_index').get().n, 1);
  const indexed = database.prepare('SELECT entity_type, entity_id, title FROM search_index').get();
  assert.equal(indexed.entity_type, 'PERSON');
  assert.equal(indexed.entity_id, person.lastInsertRowid);
  assert.equal(indexed.title, 'Byron King');
});

test('la réindexation retire les entrées devenues obsolètes', () => {
  const database = createTestDatabase();
  const persons = new PersonRepository(database);

  const person = persons.create({ givenNames: 'Ada', familyName: 'Lovelace' });
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM search_index').get().n, 1);

  // Entrée laissée par un chemin qui ne passe pas par le dépôt (index
  // obsolète pointant vers une fiche qui n'existe pas).
  database
    .prepare(
      "INSERT INTO search_index (entity_type, entity_id, title, body) VALUES ('PERSON', 999, 'Fantôme', '')",
    )
    .run();

  reindexAll(database);

  const rows = database.prepare('SELECT entity_id FROM search_index').all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].entity_id, person.id);
});

test('la réindexation exclut les fiches supprimées', () => {
  const database = createTestDatabase();
  const persons = new PersonRepository(database);

  const kept = persons.create({ givenNames: 'Ada', familyName: 'Lovelace' });
  const removed = persons.create({ givenNames: 'Byron', familyName: 'King' });
  persons.softDelete(removed.id);

  reindexAll(database);

  const rows = database.prepare('SELECT entity_id FROM search_index').all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].entity_id, kept.id);
});

test('la réindexation purge le journal d’historique périmé sur l’index', () => {
  const database = createTestDatabase();
  const persons = new PersonRepository(database);

  // Une écriture indexée est journalisée dans l'historique annulable, avec
  // le `rowid` FTS de la ligne concernée.
  const group = database
    .prepare("INSERT INTO undo_groups (label) VALUES ('Création')")
    .run().lastInsertRowid;
  database.prepare('UPDATE undo_state SET current_group = ? WHERE id = 1').run(group);
  persons.create({ givenNames: 'Ada', familyName: 'Lovelace' });
  database.prepare('UPDATE undo_state SET current_group = NULL WHERE id = 1').run();

  const before = database
    .prepare("SELECT COUNT(*) AS n FROM undo_entries WHERE table_name = 'search_index'")
    .get().n;
  assert.ok(before > 0, 'l’index écrit par le dépôt est journalisé');

  reindexAll(database);

  // La reconstruction renumérote les `rowid` FTS : les entrées d'historique
  // qui les référencent ne décrivent plus rien d'existant et seraient
  // rejouées sur le mauvais document.
  const after = database
    .prepare("SELECT COUNT(*) AS n FROM undo_entries WHERE table_name = 'search_index'")
    .get().n;
  assert.equal(after, 0);

  // L'historique des fiches, lui, est conservé.
  const personsEntries = database
    .prepare("SELECT COUNT(*) AS n FROM undo_entries WHERE table_name = 'persons'")
    .get().n;
  assert.ok(personsEntries > 0, 'l’historique des fiches est conservé');
});
