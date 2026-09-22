import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTestDatabase } from './helpers.js';
import { TrashRepository } from '../../src/db/src/repositories/trash-repository.js';
import { PersonRepository } from '../../src/db/src/repositories/person-repository.js';
import { PlaceRepository } from '../../src/db/src/repositories/place-repository.js';
import { AuditRepository } from '../../src/db/src/repositories/audit-repository.js';

test('list agrège les entités supprimées de plusieurs tables', () => {
  const database = createTestDatabase();
  const trash = new TrashRepository(database);
  const persons = new PersonRepository(database);
  const places = new PlaceRepository(database);

  const person = persons.create({ givenNames: 'Ada', familyName: 'Lovelace' });
  const place = places.create({ name: 'Londres' });
  persons.softDelete(person.id);
  places.softDelete(place.id);

  const entries = trash.list();
  assert.equal(entries.length, 2);
  assert.ok(entries.some((e) => e.table === 'persons' && e.id === person.id));
  assert.ok(entries.some((e) => e.table === 'places' && e.id === place.id));
});

test('list exclut les entités non supprimées', () => {
  const database = createTestDatabase();
  const trash = new TrashRepository(database);
  const persons = new PersonRepository(database);

  persons.create({ givenNames: 'Ada', familyName: 'Lovelace' });

  assert.deepEqual(trash.list(), []);
});

test('purge supprime définitivement une entité de la corbeille et journalise', () => {
  const database = createTestDatabase();
  const trash = new TrashRepository(database);
  const persons = new PersonRepository(database);
  const audit = new AuditRepository(database);

  const person = persons.create({ givenNames: 'Ada', familyName: 'Lovelace' });
  persons.softDelete(person.id);

  trash.purge('persons', person.id, { performedBy: 'tester' });

  assert.equal(persons.findById(person.id, { includeDeleted: true }), null);
  const entries = audit.findForEntity('persons', person.id);
  assert.ok(entries.some((e) => e.operation === 'DELETE' && e.changes?.includes('purged')));
});

test('purge refuse une entité non supprimée (pas encore dans la corbeille)', () => {
  const database = createTestDatabase();
  const trash = new TrashRepository(database);
  const persons = new PersonRepository(database);

  const person = persons.create({ givenNames: 'Ada', familyName: 'Lovelace' });

  assert.throws(() => trash.purge('persons', person.id));
});

test('purge refuse une table hors périmètre de la corbeille', () => {
  const database = createTestDatabase();
  const trash = new TrashRepository(database);

  assert.throws(() => trash.purge('schema_migrations', 1));
});
