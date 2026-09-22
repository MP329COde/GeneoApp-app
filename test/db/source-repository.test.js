import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTestDatabase } from './helpers.js';
import { PersonRepository } from '../../src/db/src/repositories/person-repository.js';
import { SourceRepository } from '../../src/db/src/repositories/source-repository.js';

test('addCitation relie une source à une entité arbitraire', () => {
  const database = createTestDatabase();
  const persons = new PersonRepository(database);
  const sources = new SourceRepository(database);

  const person = persons.create({ givenNames: 'Ada', familyName: 'Lovelace' });
  const source = sources.create({ title: 'Registre paroissial 1815' });

  sources.addCitation({
    sourceId: source.id,
    entityType: 'PERSON',
    entityId: person.id,
    page: '42',
    confidence: 'HIGH',
  });

  const citations = sources.findCitationsForEntity('PERSON', person.id);
  assert.equal(citations.length, 1);
  assert.equal(citations[0].confidence, 'HIGH');
});

test('un niveau de confiance invalide est rejeté', () => {
  const database = createTestDatabase();
  const sources = new SourceRepository(database);

  const source = sources.create({ title: 'Registre' });
  assert.throws(() =>
    sources.addCitation({
      sourceId: source.id,
      entityType: 'PERSON',
      entityId: 1,
      confidence: 'CERTAIN',
    }),
  );
});
