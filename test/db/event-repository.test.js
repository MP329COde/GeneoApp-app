import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTestDatabase } from './helpers.js';
import { PersonRepository } from '../../src/db/src/repositories/person-repository.js';
import { EventRepository } from '../../src/db/src/repositories/event-repository.js';

function createPerson(repository, overrides = {}) {
  return repository.create({ givenNames: 'Jean', familyName: 'Dupont', ...overrides });
}

test('create insère un événement avec ses participants', () => {
  const database = createTestDatabase();
  const persons = new PersonRepository(database);
  const events = new EventRepository(database);

  const groom = createPerson(persons, { givenNames: 'Jean' });
  const bride = createPerson(persons, { givenNames: 'Marie' });

  const event = events.create({
    type: 'MARRIAGE',
    dateText: '1900-06-01',
    datePrecision: 'EXACT',
    participants: [
      { personId: groom.id, role: 'PARTNER1' },
      { personId: bride.id, role: 'PARTNER2' },
    ],
  });

  assert.equal(event.type, 'MARRIAGE');
  assert.equal(event.participants.length, 2);
});

test('findForPerson retrouve les événements liés à une personne', () => {
  const database = createTestDatabase();
  const persons = new PersonRepository(database);
  const events = new EventRepository(database);

  const person = createPerson(persons);
  events.create({ type: 'BIRTH', participants: [{ personId: person.id, role: 'PRINCIPAL' }] });

  const found = events.findForPerson(person.id);
  assert.equal(found.length, 1);
  assert.equal(found[0].type, 'BIRTH');
});

test('un type d’événement invalide est rejeté par la contrainte CHECK', () => {
  const database = createTestDatabase();
  const events = new EventRepository(database);

  assert.throws(() => events.create({ type: 'INVALID' }));
});

test('les types d’événements étendus (profession, résidence, migration...) sont acceptés', () => {
  const database = createTestDatabase();
  const persons = new PersonRepository(database);
  const events = new EventRepository(database);
  const person = createPerson(persons);

  const extendedTypes = [
    'OCCUPATION',
    'RESIDENCE',
    'EMIGRATION',
    'IMMIGRATION',
    'CENSUS',
    'MILITARY',
    'GRADUATION',
    'WILL',
    'PROBATE',
    'RELIGIOUS_EVENT',
    'NATURALIZATION',
  ];

  for (const type of extendedTypes) {
    const event = events.create({
      type,
      participants: [{ personId: person.id, role: 'PRINCIPAL' }],
    });
    assert.equal(event.type, type);
  }
});

test('softDelete masque l’événement sans supprimer les personnes liées', () => {
  const database = createTestDatabase();
  const persons = new PersonRepository(database);
  const events = new EventRepository(database);

  const person = createPerson(persons);
  const event = events.create({
    type: 'BIRTH',
    participants: [{ personId: person.id, role: 'PRINCIPAL' }],
  });
  events.softDelete(event.id);

  assert.equal(events.findById(event.id), null);
  assert.ok(persons.findById(person.id));
});
