import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTestDatabase } from './helpers.js';
import { PlaceRepository } from '../../src/db/src/repositories/place-repository.js';
import { PersonRepository } from '../../src/db/src/repositories/person-repository.js';
import { EventRepository } from '../../src/db/src/repositories/event-repository.js';

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

test('restaurer un lieu fusionne avec le lieu déjà recréé de même nom', () => {
  const database = createTestDatabase();
  const repository = new PlaceRepository(database);

  const deleted = repository.create({ name: 'Londres', latitude: 51.5, longitude: -0.12 });
  repository.softDelete(deleted.id);
  const kept = repository.create({ name: 'Londres' });

  // Avant correction, cette restauration échouait sur
  // SQLITE_CONSTRAINT_UNIQUE et la fiche restait bloquée en corbeille.
  const restored = repository.restore(deleted.id);

  assert.equal(restored.id, kept.id);
  assert.equal(
    database.prepare('SELECT COUNT(*) AS n FROM places WHERE deleted_at IS NULL').get().n,
    1,
  );
  assert.equal(
    database.prepare('SELECT COUNT(*) AS n FROM places WHERE deleted_at IS NOT NULL').get().n,
    0,
  );
  // Les coordonnées perdues lors de la suppression sont conservées.
  assert.equal(restored.latitude, 51.5);
  assert.deepEqual(database.pragma('foreign_key_check'), []);
});

test('restaurer un lieu fusionné reconduit ses événements', () => {
  const database = createTestDatabase();
  const places = new PlaceRepository(database);
  const persons = new PersonRepository(database);
  const events = new EventRepository(database);

  const place = places.create({ name: 'Londres' });
  const person = persons.create({ givenNames: 'Ada', familyName: 'Lovelace', sex: 'F' });
  const event = events.create({
    type: 'BIRTH',
    dateText: '1815-12-10',
    datePrecision: 'EXACT',
    participants: [{ personId: person.id, role: 'PRINCIPAL' }],
  });
  database.prepare('UPDATE events SET place_id = ? WHERE id = ?').run(place.id, event.id);

  places.softDelete(place.id);
  const kept = places.create({ name: 'Londres' });
  places.restore(place.id);

  // L'événement doit pointer vers le lieu désormais actif, et non vers une
  // ligne supprimée.
  assert.equal(
    database.prepare('SELECT place_id FROM events WHERE id = ?').get(event.id).place_id,
    kept.id,
  );
  assert.deepEqual(database.pragma('foreign_key_check'), []);
});
