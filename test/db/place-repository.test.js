import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTestDatabase } from './helpers.js';
import { PlaceRepository } from '../../src/db/src/repositories/place-repository.js';

test('create insère un lieu et permet de le retrouver par nom normalisé', () => {
  const database = createTestDatabase();
  const repository = new PlaceRepository(database);

  const place = repository.create({ name: '  Paris, France  ' });
  const found = repository.findByName('paris, france');

  assert.equal(found.id, place.id);
});

test('deux lieux avec le même nom normalisé sont rejetés (contrainte unique)', () => {
  const database = createTestDatabase();
  const repository = new PlaceRepository(database);

  repository.create({ name: 'Lyon' });
  assert.throws(() => repository.create({ name: 'lyon' }));
});

test('un lieu supprimé libère son nom pour une recréation', () => {
  const database = createTestDatabase();
  const repository = new PlaceRepository(database);

  const place = repository.create({ name: 'Lyon' });
  repository.softDelete(place.id);

  assert.doesNotThrow(() => repository.create({ name: 'Lyon' }));
});
