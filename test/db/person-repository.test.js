import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTestDatabase } from './helpers.js';
import { PersonRepository } from '../../src/db/src/repositories/person-repository.js';
import { AuditRepository } from '../../src/db/src/repositories/audit-repository.js';

test('create insère une personne et journalise l’audit', () => {
  const database = createTestDatabase();
  const repository = new PersonRepository(database);
  const audit = new AuditRepository(database);

  const person = repository.create(
    { givenNames: 'Ada', familyName: 'Lovelace', sex: 'F' },
    { performedBy: 'tester' },
  );

  assert.equal(person.given_names, 'Ada');
  assert.equal(person.family_name, 'Lovelace');
  assert.equal(person.deleted_at, null);

  const entries = audit.findForEntity('persons', person.id);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].operation, 'INSERT');
  assert.equal(entries[0].performed_by, 'tester');
});

test('create rejette une personne sans nom', () => {
  const database = createTestDatabase();
  const repository = new PersonRepository(database);

  assert.throws(() => repository.create({ givenNames: 'Ada' }));
});

test('update modifie les champs autorisés et journalise', () => {
  const database = createTestDatabase();
  const repository = new PersonRepository(database);
  const audit = new AuditRepository(database);

  const person = repository.create({ givenNames: 'Ada', familyName: 'Lovelace' });
  const updated = repository.update(person.id, { notes: 'Pionnière de l’informatique' });

  assert.equal(updated.notes, 'Pionnière de l’informatique');

  const entries = audit.findForEntity('persons', person.id);
  assert.equal(entries.length, 2);
  assert.equal(entries[1].operation, 'UPDATE');
});

test('create et update gèrent l’identité étendue (alias, nom marital, titre, suffixe, vivant, id externe)', () => {
  const database = createTestDatabase();
  const repository = new PersonRepository(database);

  const person = repository.create({
    givenNames: 'Ada',
    familyName: 'Lovelace',
    nickname: 'Ada',
    marriedName: 'Ada King',
    title: 'Comtesse',
    suffix: null,
    isLiving: false,
    externalId: 'GEDCOM-I1',
  });

  assert.equal(person.nickname, 'Ada');
  assert.equal(person.married_name, 'Ada King');
  assert.equal(person.title, 'Comtesse');
  assert.equal(person.is_living, 0);
  assert.equal(person.external_id, 'GEDCOM-I1');

  const updated = repository.update(person.id, { isLiving: true, suffix: 'III' });
  assert.equal(updated.is_living, 1);
  assert.equal(updated.suffix, 'III');
});

test('create applique isLiving=true par défaut', () => {
  const database = createTestDatabase();
  const repository = new PersonRepository(database);

  const person = repository.create({ givenNames: 'Ada', familyName: 'Lovelace' });

  assert.equal(person.is_living, 1);
});

test('update lève une erreur si la personne est introuvable', () => {
  const database = createTestDatabase();
  const repository = new PersonRepository(database);

  assert.throws(() => repository.update(999, { notes: 'x' }));
});

test('softDelete masque la personne des recherches par défaut', () => {
  const database = createTestDatabase();
  const repository = new PersonRepository(database);
  const audit = new AuditRepository(database);

  const person = repository.create({ givenNames: 'Ada', familyName: 'Lovelace' });
  repository.softDelete(person.id, { performedBy: 'tester' });

  assert.equal(repository.findById(person.id), null);
  assert.ok(repository.findById(person.id, { includeDeleted: true }));
  assert.equal(repository.list().length, 0);
  assert.equal(repository.list({ includeDeleted: true }).length, 1);

  const entries = audit.findForEntity('persons', person.id);
  assert.equal(entries.at(-1).operation, 'DELETE');
});

test('restore réactive une personne supprimée', () => {
  const database = createTestDatabase();
  const repository = new PersonRepository(database);

  const person = repository.create({ givenNames: 'Ada', familyName: 'Lovelace' });
  repository.softDelete(person.id);
  const restored = repository.restore(person.id, { performedBy: 'tester' });

  assert.equal(restored.deleted_at, null);
  assert.ok(repository.findById(person.id));
});

test('restore échoue si la personne n’est pas supprimée', () => {
  const database = createTestDatabase();
  const repository = new PersonRepository(database);

  const person = repository.create({ givenNames: 'Ada', familyName: 'Lovelace' });
  assert.throws(() => repository.restore(person.id));
});

test('une transaction annule toutes les écritures en cas d’erreur', () => {
  const database = createTestDatabase();
  const repository = new PersonRepository(database);

  assert.throws(() => repository.update(999, { notes: 'x' }));

  const countBefore = database.prepare('SELECT COUNT(*) AS n FROM audit_log').get().n;
  assert.equal(countBefore, 0);
});
