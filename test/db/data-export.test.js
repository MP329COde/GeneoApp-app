import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTestDatabase } from './helpers.js';
import { PersonRepository } from '../../src/db/src/repositories/person-repository.js';
import { PlaceRepository } from '../../src/db/src/repositories/place-repository.js';
import { AuditRepository } from '../../src/db/src/repositories/audit-repository.js';
import {
  EXPORTABLE_TABLES,
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

// Une table métier absente de la sauvegarde logique est perdue en silence à la
// restauration. Toute nouvelle table doit donc être soit sauvegardée, soit
// déclarée ici comme dérivée ou technique, avec sa raison : l'oubli fait
// échouer ce test.
const NOT_BACKED_UP = {
  schema_migrations: 'état du schéma, recréé par les migrations',
  // Historique annulable : technique, borné, non portable d'une base à l'autre.
  undo_entries: 'historique annulable',
  undo_groups: 'historique annulable',
  undo_state: 'historique annulable',
  // Index reconstructibles à partir des tables sources.
  index_connectors: 'configuration d’indexation, reconstructible',
  index_runs: 'journal d’indexation',
  index_settings: 'configuration d’indexation',
  index_sources: 'index de documents, reconstructible',
  indexed_documents: 'index de documents, reconstructible',
  search_index_map: 'correspondance de l’index de recherche, reconstruite avec lui',
};

test('toute table du schéma est sauvegardée ou explicitement exclue', () => {
  const database = createTestDatabase();
  const tables = database
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
         AND name NOT LIKE 'search_index_%' AND name NOT LIKE 'documents_fts%'`,
    )
    .all()
    .map((row) => row.name);

  const missing = tables.filter(
    (name) => !EXPORTABLE_TABLES.includes(name) && !(name in NOT_BACKED_UP),
  );
  assert.deepEqual(missing, [], `tables ni sauvegardées ni exclues : ${missing.join(', ')}`);
  for (const name of Object.keys(NOT_BACKED_UP)) {
    assert.ok(tables.includes(name) || name === 'search_index_map', `exclusion périmée : ${name}`);
  }
  for (const name of EXPORTABLE_TABLES) {
    assert.ok(
      tables.includes(name) || name === 'search_index',
      `table sauvegardée inexistante : ${name}`,
    );
  }
});

test('les identifiants externes et l’historique des lieux survivent à une sauvegarde logique', () => {
  const database = createTestDatabase();
  const persons = new PersonRepository(database);
  const places = new PlaceRepository(database);

  const person = persons.create({ givenNames: 'Ada', familyName: 'Lovelace' });
  persons.addIdentifier(person.id, { scheme: 'wikidata', value: 'Q7259' });
  const france = places.create({ name: 'France' });
  const paris = places.create({ name: 'Paris', placeType: 'COMMUNE' });
  places.addName(paris.id, { name: 'Lutèce', validToYear: 400 });
  places.addParent(paris.id, { parentPlaceId: france.id });

  const target = createTestDatabase();
  importDatabaseFromJson(target, exportDatabaseToJson(database));

  const restoredPersons = new PersonRepository(target);
  const restoredPlaces = new PlaceRepository(target);
  assert.deepEqual(
    restoredPersons.listIdentifiers(person.id).map((item) => `${item.scheme}:${item.value}`),
    ['WIKIDATA:Q7259'],
  );
  assert.equal(restoredPlaces.nameAt(paris.id, 300), 'Lutèce');
  assert.equal(restoredPlaces.resolveAt(paris.id).fullName, 'Paris, France');
});
