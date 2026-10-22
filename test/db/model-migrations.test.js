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

/**
 * Base « d'un utilisateur sur une version antérieure » : seules les migrations
 * strictement antérieures à `beforeName` sont appliquées. Le callback reçoit la
 * base pour y semer des données réelles avant la mise à jour.
 */
function upgradeFrom(beforeName, seed, verify) {
  const earlyDir = mkdtempSync(path.join(tmpdir(), 'geneoapp-model-migrations-'));
  for (const name of readdirSync(MIGRATIONS_DIR)) {
    if (name.endsWith('.sql') && name < beforeName) {
      copyFileSync(path.join(MIGRATIONS_DIR, name), path.join(earlyDir, name));
    }
  }
  const database = openDatabase(':memory:');
  try {
    runMigrations(database, { migrationsDir: earlyDir });
    const context = seed(database);
    const applied = runMigrations(database);
    assert.ok(
      applied.some((name) => name.startsWith(beforeName)),
      `${beforeName} non appliquée`,
    );
    assert.equal(database.pragma('foreign_keys')[0].foreign_keys, 1);
    assert.deepEqual(database.pragma('foreign_key_check'), []);
    verify(database, context);
    // Idempotence : une seconde passe n'applique plus rien.
    assert.deepEqual(runMigrations(database), []);
  } finally {
    database.close();
    rmSync(earlyDir, { recursive: true, force: true });
  }
}

test('0026 : événements et participants existants sont conservés, nouveaux types acceptés', () => {
  upgradeFrom(
    '0026',
    (database) => {
      const person = database
        .prepare("INSERT INTO persons (given_names, family_name) VALUES ('Ada', 'Lovelace')")
        .run().lastInsertRowid;
      const event = database
        .prepare(
          `INSERT INTO events (type, value, date_text, date_precision)
           VALUES ('OCCUPATION', 'Mathématicienne', 'vers 1840', 'ABOUT')`,
        )
        .run().lastInsertRowid;
      database
        .prepare(
          "INSERT INTO event_participants (event_id, person_id, role) VALUES (?, ?, 'PRINCIPAL')",
        )
        .run(event, person);
      const union = database
        .prepare('INSERT INTO unions (type, start_event_id) VALUES (?, ?)')
        .run('MARRIAGE', event).lastInsertRowid;
      return { person, event, union };
    },
    (database, { person, event, union }) => {
      const kept = database.prepare('SELECT * FROM events WHERE id = ?').get(event);
      assert.equal(kept.type, 'OCCUPATION');
      assert.equal(kept.value, 'Mathématicienne');
      assert.equal(kept.date_precision, 'ABOUT');
      assert.equal(
        database.prepare('SELECT role FROM event_participants WHERE event_id = ?').get(event).role,
        'PRINCIPAL',
      );
      assert.equal(
        database.prepare('SELECT start_event_id FROM unions WHERE id = ?').get(union)
          .start_event_id,
        event,
      );

      // Nouveaux types et précisions.
      for (const type of ['MIGRATION', 'SUCCESSION', 'RELIGIOUS_COMMITMENT']) {
        database.prepare('INSERT INTO events (type) VALUES (?)').run(type);
      }
      for (const precision of ['ESTIMATED', 'CALCULATED']) {
        database
          .prepare("INSERT INTO events (type, date_precision) VALUES ('BIRTH', ?)")
          .run(precision);
      }
      // Nouveaux rôles.
      for (const role of ['GODPARENT', 'INFORMANT', 'GUARDIAN', 'HEIR', 'FATHER', 'MOTHER']) {
        database
          .prepare('INSERT INTO event_participants (event_id, person_id, role) VALUES (?, ?, ?)')
          .run(event, person, role);
      }
      // Les valeurs inconnues restent refusées.
      assert.throws(
        () => database.prepare("INSERT INTO events (type) VALUES ('INVENTED')").run(),
        /CHECK constraint failed/,
      );
      assert.throws(
        () =>
          database
            .prepare("INSERT INTO events (type, date_precision) VALUES ('BIRTH', 'MAYBE')")
            .run(),
        /CHECK constraint failed/,
      );
      assert.throws(
        () =>
          database
            .prepare(
              "INSERT INTO event_participants (event_id, person_id, role) VALUES (?, ?, 'KING')",
            )
            .run(event, person),
        /CHECK constraint failed/,
      );
    },
  );
});

test('0027 : filiations et personnes existantes conservées, tutelle et identité étendue acceptées', () => {
  upgradeFrom(
    '0027',
    (database) => {
      const insertPerson = database.prepare(
        "INSERT INTO persons (given_names, family_name, external_id) VALUES (?, 'Test', ?)",
      );
      const child = insertPerson.run('Enfant', '@I1@').lastInsertRowid;
      const parent = insertPerson.run('Parent', '@I2@').lastInsertRowid;
      const parentage = database
        .prepare(
          `INSERT INTO parentages (child_id, parent_id, parent_role, link_type, notes)
           VALUES (?, ?, 'FATHER', 'ADOPTIVE', 'adoption plénière')`,
        )
        .run(child, parent).lastInsertRowid;
      return { child, parent, parentage };
    },
    (database, { child, parent, parentage }) => {
      const kept = database.prepare('SELECT * FROM parentages WHERE id = ?').get(parentage);
      assert.equal(kept.link_type, 'ADOPTIVE');
      assert.equal(kept.parent_role, 'FATHER');
      assert.equal(kept.notes, 'adoption plénière');

      // Valeurs par défaut des colonnes ajoutées sur une personne existante.
      const person = database.prepare('SELECT * FROM persons WHERE id = ?').get(child);
      assert.equal(person.alias, null);
      assert.equal(person.is_private, 0);
      assert.equal(person.external_id, '@I1@');

      // Tutelle acceptée, valeur inconnue toujours refusée, unicité préservée.
      database.prepare('DELETE FROM parentages WHERE id = ?').run(parentage);
      database
        .prepare(
          "INSERT INTO parentages (child_id, parent_id, link_type) VALUES (?, ?, 'GUARDIAN')",
        )
        .run(child, parent);
      assert.throws(
        () =>
          database
            .prepare("INSERT INTO parentages (child_id, parent_id, link_type) VALUES (?, ?, 'X')")
            .run(parent, child),
        /CHECK constraint failed/,
      );
      assert.throws(
        () =>
          database
            .prepare(
              "INSERT INTO parentages (child_id, parent_id, link_type) VALUES (?, ?, 'STEP')",
            )
            .run(child, parent),
        /UNIQUE constraint failed/,
      );
      assert.throws(
        () => database.prepare('UPDATE persons SET is_private = 2 WHERE id = ?').run(child),
        /CHECK constraint failed/,
      );

      // Identifiants externes : unicité (personne, schéma, valeur) parmi les actifs.
      const addIdentifier = database.prepare(
        'INSERT INTO person_identifiers (person_id, scheme, value) VALUES (?, ?, ?)',
      );
      addIdentifier.run(child, 'WIKIDATA', 'Q1');
      assert.throws(() => addIdentifier.run(child, 'WIKIDATA', 'Q1'), /UNIQUE constraint failed/);
      addIdentifier.run(parent, 'WIKIDATA', 'Q1');
    },
  );
});
