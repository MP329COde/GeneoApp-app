import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../../src/db/src/database.js';
import { foldText } from '../../src/db/src/database.js';
import { createTestDatabase } from './helpers.js';
import { PersonRepository } from '../../src/db/src/repositories/person-repository.js';

test('foldText retire accents et casse', () => {
  assert.equal(foldText('Lefèvre'), 'lefevre');
  assert.equal(foldText('ÉLODIE'), 'elodie');
});

test('la fonction SQL FOLD est enregistrée', () => {
  const db = openDatabase(':memory:');
  assert.equal(db.prepare("SELECT FOLD('Lefèvre') AS v").get().v, 'lefevre');
});

test('le filtre q ignore accents et casse', () => {
  const database = createTestDatabase();
  const persons = new PersonRepository(database);
  persons.create({ givenNames: 'Élodie', familyName: 'Lefèvre' });
  persons.create({ givenNames: 'Ada', familyName: 'Lovelace' });
  assert.equal(persons.count({ q: 'lefevre' }), 1);
  assert.equal(persons.count({ q: 'ELODIE' }), 1);
  assert.equal(persons.count({ q: 'lefèvre' }), 1);
  assert.equal(persons.count({ q: 'zzz' }), 0);
});
