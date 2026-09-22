import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTestDatabase } from './helpers.js';
import { PersonRepository } from '../../src/db/src/repositories/person-repository.js';
import { PlaceRepository } from '../../src/db/src/repositories/place-repository.js';
import { AuditRepository } from '../../src/db/src/repositories/audit-repository.js';
import {
  exportDatabaseToJson,
  importDatabaseFromJson,
} from '../../src/db/src/backup/data-export.js';

test('export puis import restitue fidèlement le contenu des tables', () => {
  const database = createTestDatabase();
  const persons = new PersonRepository(database);
  const places = new PlaceRepository(database);

  persons.create({ givenNames: 'Ada', familyName: 'Lovelace' });
  places.create({ name: 'Londres' });

  const dump = exportDatabaseToJson(database);

  const target = createTestDatabase();
  importDatabaseFromJson(target, dump, { performedBy: 'tester' });

  const restoredPersons = new PersonRepository(target).list();
  const restoredPlaces = new PlaceRepository(target).list();
  assert.equal(restoredPersons.length, 1);
  assert.equal(restoredPersons[0].given_names, 'Ada');
  assert.equal(restoredPlaces.length, 1);
  assert.equal(restoredPlaces[0].name, 'Londres');
});

test('import journalise une entrée RESTORE de niveau "database"', () => {
  const database = createTestDatabase();
  const audit = new AuditRepository(database);
  const dump = exportDatabaseToJson(database);

  importDatabaseFromJson(database, dump, { performedBy: 'tester' });

  const entries = audit.findForEntity('database', 0);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].operation, 'RESTORE');
  assert.equal(entries[0].performed_by, 'tester');
});

test('import rejette un format inconnu sans modifier la base', () => {
  const database = createTestDatabase();
  const persons = new PersonRepository(database);
  persons.create({ givenNames: 'Ada', familyName: 'Lovelace' });

  assert.throws(() => importDatabaseFromJson(database, { format: 'autre-chose' }));
  assert.equal(persons.list().length, 1);
});

test('import rejette une table inconnue sans modifier la base (atomicité)', () => {
  const database = createTestDatabase();
  const persons = new PersonRepository(database);
  const existing = persons.create({ givenNames: 'Ada', familyName: 'Lovelace' });

  const dump = exportDatabaseToJson(database);
  dump.tables.table_inconnue = [{ id: 1 }];

  assert.throws(() => importDatabaseFromJson(database, dump));
  // La base reste intacte : ni purgée, ni partiellement réimportée.
  assert.deepEqual(
    persons.list().map((p) => p.id),
    [existing.id],
  );
});

test('import rejette une violation d’intégrité référentielle (atomicité, pragma réactivé)', () => {
  const database = createTestDatabase();
  const persons = new PersonRepository(database);
  const existing = persons.create({ givenNames: 'Ada', familyName: 'Lovelace' });

  const dump = exportDatabaseToJson(database);
  // Un parentage référence un enfant/parent inexistant : violation FK.
  dump.tables.parentages = [
    {
      id: 1,
      child_id: 999999,
      parent_id: 888888,
      parent_role: 'FATHER',
      link_type: 'BIOLOGICAL',
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
      deleted_at: null,
    },
  ];

  assert.throws(() => importDatabaseFromJson(database, dump));
  assert.equal(database.pragma('foreign_keys', { simple: true }), 1);
  assert.deepEqual(
    persons.list().map((p) => p.id),
    [existing.id],
  );
});
