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
