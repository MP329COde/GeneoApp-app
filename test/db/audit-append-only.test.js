import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTestDatabase } from './helpers.js';
import { PersonRepository } from '../../src/db/src/repositories/person-repository.js';
import { AuditRepository } from '../../src/db/src/repositories/audit-repository.js';
import { UndoHistory } from '../../src/db/src/history/undo-history.js';
import {
  exportDatabaseToJson,
  importDatabaseFromJson,
} from '../../src/db/src/backup/data-export.js';

const flag = (database) =>
  database.prepare('SELECT allow_purge AS value FROM audit_state WHERE id = 1').get().value;

test('le journal d’audit refuse toute modification et toute suppression directes', () => {
  const database = createTestDatabase();
  new PersonRepository(database).create({ givenNames: 'Ada', familyName: 'Lovelace' });
  const before = database.prepare('SELECT COUNT(*) AS n FROM audit_log').get().n;
  assert.ok(before > 0);

  assert.throws(
    () => database.prepare("UPDATE audit_log SET operation = 'DELETE'").run(),
    /ajout seul : modification interdite/,
  );
  assert.throws(
    () => database.prepare('UPDATE audit_log SET changes = NULL WHERE id = 1').run(),
    /ajout seul/,
  );
  assert.throws(() => database.prepare('DELETE FROM audit_log').run(), /suppression interdite/);
  assert.throws(
    () => database.prepare('DELETE FROM audit_log WHERE id = 1').run(),
    /suppression interdite/,
  );
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM audit_log').get().n, before);
  // Ajouter reste évidemment possible.
  database
    .prepare(
      "INSERT INTO audit_log (table_name, row_id, operation) VALUES ('persons', 1, 'UPDATE')",
    )
    .run();
  assert.equal(flag(database), 0);
});

test('la purge explicite reste possible, bornée dans le temps, et referme la fenêtre', () => {
  const database = createTestDatabase();
  const persons = new PersonRepository(database);
  persons.create({ givenNames: 'Ada', familyName: 'Lovelace' });
  database.prepare('UPDATE audit_state SET allow_purge = 0').run();
  const audit = new AuditRepository(database);
  const total = audit.count();

  assert.equal(audit.purgeBefore('2000-01-01T00:00:00.000Z'), 0, 'rien d’antérieur à 2000');
  assert.equal(audit.count(), total);
  const removed = audit.purgeBefore('2999-01-01T00:00:00.000Z');
  assert.equal(removed, total);
  assert.equal(audit.count(), 0);
  assert.equal(flag(database), 0, 'la fenêtre de purge est refermée');
  // Après la purge, la protection est de nouveau active.
  persons.create({ givenNames: 'Byron', familyName: 'King' });
  assert.throws(() => database.prepare('DELETE FROM audit_log').run(), /suppression interdite/);
});

test('une erreur pendant la purge ne laisse jamais la fenêtre ouverte', () => {
  const database = createTestDatabase();
  database
    .prepare(
      "INSERT INTO audit_log (table_name, row_id, operation) VALUES ('persons', 1, 'INSERT')",
    )
    .run();
  const audit = new AuditRepository(database);
  assert.throws(() => audit.purgeBefore(Symbol('pas une date')));
  assert.equal(flag(database), 0);
  assert.throws(() => database.prepare('DELETE FROM audit_log').run(), /suppression interdite/);
});

test('annuler et rétablir sont journalisés dans l’audit, qui n’est jamais réécrit', () => {
  const database = createTestDatabase();
  const history = new UndoHistory(database);
  const persons = new PersonRepository(database);
  const group = history.begin('Ajout · personne', 'alice');
  persons.create({ givenNames: 'Ada', familyName: 'Lovelace' });
  history.end(group);

  const auditBefore = database.prepare('SELECT COUNT(*) AS n FROM audit_log').get().n;
  history.undo({ performedBy: 'alice' });
  history.redo({ performedBy: 'alice' });

  const entries = database
    .prepare("SELECT * FROM audit_log WHERE table_name = 'history' ORDER BY id")
    .all();
  assert.deepEqual(
    entries.map((entry) => entry.operation),
    ['UNDO', 'REDO'],
  );
  assert.equal(entries[0].performed_by, 'alice');
  const changes = JSON.parse(entries[0].changes);
  assert.equal(changes.label, 'Ajout · personne');
  assert.ok(changes.tables.includes('persons'));
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM audit_log').get().n, auditBefore + 2);
});

test('la restauration d’une sauvegarde logique remplace le journal sans laisser la porte ouverte', () => {
  const source = createTestDatabase();
  new PersonRepository(source).create({ givenNames: 'Ada', familyName: 'Lovelace' });
  const dump = exportDatabaseToJson(source);

  const target = createTestDatabase();
  new PersonRepository(target).create({ givenNames: 'Autre', familyName: 'Personne' });
  importDatabaseFromJson(target, dump, { performedBy: 'tester' });
  assert.equal(flag(target), 0);
  assert.ok(target.prepare('SELECT COUNT(*) AS n FROM audit_log').get().n > 0);
  assert.throws(() => target.prepare('DELETE FROM audit_log').run(), /suppression interdite/);

  // Une restauration invalide n'ouvre ni ne laisse ouverte la fenêtre.
  assert.throws(() => importDatabaseFromJson(target, { format: 'faux' }));
  assert.equal(flag(target), 0);
});
