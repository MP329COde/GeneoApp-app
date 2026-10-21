import assert from 'node:assert/strict';
import { test } from 'node:test';
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from '../../src/db/src/database.js';
import { runMigrations } from '../../src/db/src/migrate.js';

const MIGRATIONS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'src',
  'db',
  'src',
  'migrations',
);

test('runMigrations crée toutes les tables attendues', () => {
  const database = openDatabase(':memory:');
  const applied = runMigrations(database);

  assert.ok(applied.length > 0);

  const tables = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((row) => row.name);

  for (const expected of [
    'persons',
    'places',
    'events',
    'event_participants',
    'unions',
    'union_partners',
    'parentages',
    'sources',
    'citations',
    'audit_log',
    'schema_migrations',
  ]) {
    assert.ok(tables.includes(expected), `table manquante : ${expected}`);
  }

  database.close();
});

test('runMigrations est idempotent', () => {
  const database = openDatabase(':memory:');
  runMigrations(database);
  const secondRun = runMigrations(database);

  assert.deepEqual(secondRun, []);

  database.close();
});

// Une migration qui reconstruit une table (procédure SQLite : créer, copier,
// supprimer, renommer) échouait sur « DROP TABLE » dès que des données
// réelles existaient : la table fille qui référence la table reconstruite
// bloquait la suppression, car les clés étrangères sont actives. Un
// utilisateur ayant saisi un événement avec un participant ne pouvait plus
// ouvrir l'application après une mise à jour.
test('runMigrations applique les migrations sur une base contenant des données', () => {
  // Un dossier de migrations ne contenant que les migrations antérieures à la
  // reconstruction de la table `events` (migration 0008) : on obtient une
  // base « ancienne », comme celle d'un utilisateur sur une version
  // antérieure.
  const earlyDir = mkdtempSync(path.join(tmpdir(), 'geneoapp-migrations-early-'));
  for (const name of readdirSync(MIGRATIONS_DIR)) {
    if (name.endsWith('.sql') && name < '0008') {
      copyFileSync(path.join(MIGRATIONS_DIR, name), path.join(earlyDir, name));
    }
  }

  const database = openDatabase(':memory:');
  try {
    runMigrations(database, { migrationsDir: earlyDir });

    // Données réelles : une personne, un événement, un participant.
    const person = database
      .prepare(
        "INSERT INTO persons (given_names, family_name, sex) VALUES ('Ada', 'Lovelace', 'F')",
      )
      .run();
    const event = database
      .prepare(
        "INSERT INTO events (type, date_text, date_precision) VALUES ('BIRTH', '1815-12-10', 'EXACT')",
      )
      .run();
    database
      .prepare(
        "INSERT INTO event_participants (event_id, person_id, role) VALUES (?, ?, 'PRINCIPAL')",
      )
      .run(event.lastInsertRowid, person.lastInsertRowid);

    // Les migrations restantes doivent s'appliquer sans erreur.
    const applied = runMigrations(database);

    assert.ok(applied.length > 0, 'aucune migration restante n’a été appliquée');

    // Les données sont intactes, et les clés étrangères sont réactivées.
    assert.equal(database.prepare('SELECT COUNT(*) AS n FROM persons').get().n, 1);
    assert.equal(database.prepare('SELECT COUNT(*) AS n FROM events').get().n, 1);
    assert.equal(database.prepare('SELECT COUNT(*) AS n FROM event_participants').get().n, 1);
    assert.equal(database.pragma('foreign_keys')[0].foreign_keys, 1);
    assert.deepEqual(database.pragma('foreign_key_check'), []);

    // La référence de la table fille pointe bien vers la table reconstruite.
    const definition = database
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'event_participants'")
      .get().sql;
    assert.match(definition, /REFERENCES events\(id\)/);
  } finally {
    database.close();
    rmSync(earlyDir, { recursive: true, force: true });
  }
});

// Les notes ne pouvaient viser ni une union ni une filiation, et 'FAMILY'
// était accepté alors qu'aucune table ne le porte : une note de famille était
// donc inaccessible. La migration élargit les cibles et convertit les notes
// de famille en notes d'union.
test('la migration 0020 élargit les cibles de note et convertit les notes de famille', () => {
  // Un dossier de migrations antérieur à la reconstruction de la table `notes`
  // (migration 0020) : base « ancienne », comme celle d'un utilisateur sur une
  // version antérieure.
  const earlyDir = mkdtempSync(path.join(tmpdir(), 'geneoapp-migrations-notes-'));
  for (const name of readdirSync(MIGRATIONS_DIR)) {
    if (name.endsWith('.sql') && name < '0020') {
      copyFileSync(path.join(MIGRATIONS_DIR, name), path.join(earlyDir, name));
    }
  }

  const database = openDatabase(':memory:');
  try {
    runMigrations(database, { migrationsDir: earlyDir });

    const person = database
      .prepare(
        "INSERT INTO persons (given_names, family_name, sex) VALUES ('Ada', 'Lovelace', 'F')",
      )
      .run();
    const union = database.prepare("INSERT INTO unions (type) VALUES ('MARRIAGE')").run();
    database
      .prepare('INSERT INTO union_partners (union_id, person_id) VALUES (?, ?)')
      .run(union.lastInsertRowid, person.lastInsertRowid);

    // Une note de famille (inaccessible : aucune table ne la porte), une note
    // de personne (valide) et une note d'union (alors refusée par le CHECK).
    const familyNote = database
      .prepare(
        "INSERT INTO notes (entity_type, entity_id, body) VALUES ('FAMILY', ?, 'Note de famille')",
      )
      .run(union.lastInsertRowid);
    const personNote = database
      .prepare(
        "INSERT INTO notes (entity_type, entity_id, body) VALUES ('PERSON', ?, 'Note de personne')",
      )
      .run(person.lastInsertRowid);

    // La cible 'UNION' est refusée avant la migration : c'est le défaut corrigé.
    assert.throws(
      () =>
        database
          .prepare("INSERT INTO notes (entity_type, entity_id, body) VALUES ('UNION', ?, 'x')")
          .run(union.lastInsertRowid),
      /CHECK constraint failed/,
    );

    const applied = runMigrations(database);
    assert.ok(applied.includes('0020_expand_note_entity_types.sql'));

    // La note de famille est devenue une note d'union, et la note de personne
    // est intacte.
    const converted = database
      .prepare('SELECT entity_type, entity_id, body FROM notes WHERE id = ?')
      .get(familyNote.lastInsertRowid);
    assert.equal(converted.entity_type, 'UNION');
    assert.equal(converted.entity_id, union.lastInsertRowid);
    assert.equal(converted.body, 'Note de famille');

    const kept = database
      .prepare('SELECT entity_type, body FROM notes WHERE id = ?')
      .get(personNote.lastInsertRowid);
    assert.equal(kept.entity_type, 'PERSON');
    assert.equal(kept.body, 'Note de personne');

    // Les nouvelles cibles sont désormais acceptées.
    database
      .prepare(
        "INSERT INTO notes (entity_type, entity_id, body) VALUES ('UNION', ?, 'Sur l’union')",
      )
      .run(union.lastInsertRowid);
    database
      .prepare(
        "INSERT INTO notes (entity_type, entity_id, body) VALUES ('PARENTAGE', ?, 'Sur la filiation')",
      )
      .run(1);

    // Et 'FAMILY' ne l'est plus.
    assert.throws(
      () =>
        database
          .prepare("INSERT INTO notes (entity_type, entity_id, body) VALUES ('FAMILY', 1, 'x')")
          .run(),
      /CHECK constraint failed/,
    );

    assert.deepEqual(database.pragma('foreign_key_check'), []);
  } finally {
    database.close();
    rmSync(earlyDir, { recursive: true, force: true });
  }
});

// L'index de recherche locale est alimenté à la main par les dépôts métier.
// L'import GEDCOM écrit en SQL direct : les personnes importées n'étaient pas
// indexées et restaient introuvables par la recherche. La migration 0021
// reconstruit l'index à partir des tables sources.
test('la migration 0021 réindexe les fiches absentes de l’index de recherche', () => {
  // Un dossier de migrations antérieur à la réindexation (migration 0021) :
  // base « ancienne », comme celle d'un utilisateur sur une version antérieure.
  const earlyDir = mkdtempSync(path.join(tmpdir(), 'geneoapp-migrations-reindex-'));
  for (const name of readdirSync(MIGRATIONS_DIR)) {
    if (name.endsWith('.sql') && name < '0021') {
      copyFileSync(path.join(MIGRATIONS_DIR, name), path.join(earlyDir, name));
    }
  }

  const database = openDatabase(':memory:');
  try {
    runMigrations(database, { migrationsDir: earlyDir });

    // Fiche écrite en SQL direct, comme le fait l'import GEDCOM.
    database
      .prepare(
        "INSERT INTO persons (given_names, family_name, sex) VALUES ('Ada', 'Lovelace', 'F')",
      )
      .run();
    assert.equal(database.prepare('SELECT COUNT(*) AS n FROM search_index').get().n, 0);

    const applied = runMigrations(database);
    assert.ok(applied.includes('0021_reindex_search_index.sql'));

    // La fiche est indexée et retrouvable.
    const indexed = database
      .prepare('SELECT entity_type, entity_id, title FROM search_index')
      .get();
    assert.equal(indexed.entity_type, 'PERSON');
    assert.equal(indexed.title, 'Ada Lovelace');

    const found = database
      .prepare("SELECT entity_id FROM search_index WHERE search_index MATCH 'Lovelace'")
      .all();
    assert.equal(found.length, 1);
  } finally {
    database.close();
    rmSync(earlyDir, { recursive: true, force: true });
  }
});

// FTS5 n'accepte ni trigger ni index secondaire, et ses colonnes
// `entity_type`/`entity_id` sont UNINDEXED : retrouver la ligne d'une entité
// imposait un parcours complet de l'index, à chaque écriture de fiche. La
// migration 0022 introduit la table de correspondance.
test('la migration 0022 relie les entités indexées à leurs lignes d’index', () => {
  const earlyDir = mkdtempSync(path.join(tmpdir(), 'geneoapp-migrations-map-'));
  for (const name of readdirSync(MIGRATIONS_DIR)) {
    if (name.endsWith('.sql') && name < '0022') {
      copyFileSync(path.join(MIGRATIONS_DIR, name), path.join(earlyDir, name));
    }
  }

  const database = openDatabase(':memory:');
  try {
    runMigrations(database, { migrationsDir: earlyDir });

    // Base déjà peuplée, comme celle d'un utilisateur sur une version
    // antérieure : l'index contient des entrées, mais pas de correspondance.
    database
      .prepare(
        "INSERT INTO persons (given_names, family_name, sex) VALUES ('Ada', 'Lovelace', 'F')",
      )
      .run();
    database
      .prepare(
        "INSERT INTO search_index (entity_type, entity_id, title, body) VALUES ('PERSON', 1, 'Ada Lovelace', '')",
      )
      .run();
    assert.equal(
      database
        .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'search_index_map'")
        .get().n,
      0,
      'la correspondance n’existe pas encore',
    );

    const applied = runMigrations(database);
    assert.ok(applied.includes('0022_search_index_map.sql'));

    // La correspondance a été reconstruite depuis l'index existant.
    const mapped = database
      .prepare('SELECT entity_type, entity_id, rowid FROM search_index_map')
      .all();
    assert.equal(mapped.length, 1);
    assert.equal(mapped[0].entity_type, 'PERSON');
    assert.equal(mapped[0].entity_id, 1);

    // Le rowid pointé est bien celui de la ligne d'index.
    const indexed = database
      .prepare('SELECT rowid FROM search_index WHERE entity_type = ? AND entity_id = ?')
      .get('PERSON', 1);
    assert.equal(mapped[0].rowid, indexed.rowid);

    // La fiche reste trouvable par la recherche.
    const found = database
      .prepare("SELECT entity_id FROM search_index WHERE search_index MATCH 'Lovelace'")
      .all();
    assert.equal(found.length, 1);
  } finally {
    database.close();
    rmSync(earlyDir, { recursive: true, force: true });
  }
});
