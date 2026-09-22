import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTestDatabase } from './helpers.js';
import { PersonRepository } from '../../src/db/src/repositories/person-repository.js';
import { UnionRepository } from '../../src/db/src/repositories/union-repository.js';
import { ParentageRepository } from '../../src/db/src/repositories/parentage-repository.js';

function createPerson(repository, givenNames) {
  return repository.create({ givenNames, familyName: 'Dupont' });
}

test('create insère une union avec ses partenaires', () => {
  const database = createTestDatabase();
  const persons = new PersonRepository(database);
  const unions = new UnionRepository(database);

  const a = createPerson(persons, 'Jean');
  const b = createPerson(persons, 'Marie');

  const union = unions.create({ type: 'MARRIAGE', partnerIds: [a.id, b.id] });

  assert.equal(union.partnerIds.length, 2);
  assert.deepEqual(union.partnerIds.sort(), [a.id, b.id].sort());
});

test('create rejette une union avec moins de deux partenaires', () => {
  const database = createTestDatabase();
  const persons = new PersonRepository(database);
  const unions = new UnionRepository(database);

  const a = createPerson(persons, 'Jean');
  assert.throws(() => unions.create({ partnerIds: [a.id] }));
});

test('une filiation modélise un enfant avec un seul parent connu', () => {
  const database = createTestDatabase();
  const persons = new PersonRepository(database);
  const parentages = new ParentageRepository(database);

  const child = createPerson(persons, 'Paul');
  const mother = createPerson(persons, 'Marie');

  const parentage = parentages.create({
    childId: child.id,
    parentId: mother.id,
    parentRole: 'MOTHER',
  });

  assert.equal(parentage.child_id, child.id);
  assert.equal(parentages.findParentsOf(child.id).length, 1);
  assert.equal(parentages.findChildrenOf(mother.id).length, 1);
});

test('une personne ne peut pas être son propre parent', () => {
  const database = createTestDatabase();
  const persons = new PersonRepository(database);
  const parentages = new ParentageRepository(database);

  const person = createPerson(persons, 'Paul');
  assert.throws(() => parentages.create({ childId: person.id, parentId: person.id }));
});

test('une famille recomposée : demi-frères partageant un seul parent', () => {
  const database = createTestDatabase();
  const persons = new PersonRepository(database);
  const parentages = new ParentageRepository(database);

  const father = createPerson(persons, 'Jean');
  const childA = createPerson(persons, 'Paul');
  const childB = createPerson(persons, 'Luc');

  parentages.create({ childId: childA.id, parentId: father.id, parentRole: 'FATHER' });
  parentages.create({
    childId: childB.id,
    parentId: father.id,
    parentRole: 'FATHER',
    linkType: 'ADOPTIVE',
  });

  const children = parentages.findChildrenOf(father.id);
  assert.equal(children.length, 2);
  assert.equal(children.find((c) => c.child_id === childB.id).link_type, 'ADOPTIVE');
});

test('softDelete d’une union ne supprime pas les personnes', () => {
  const database = createTestDatabase();
  const persons = new PersonRepository(database);
  const unions = new UnionRepository(database);

  const a = createPerson(persons, 'Jean');
  const b = createPerson(persons, 'Marie');
  const union = unions.create({ partnerIds: [a.id, b.id] });

  unions.softDelete(union.id);

  assert.equal(unions.findById(union.id), null);
  assert.ok(persons.findById(a.id));
});
