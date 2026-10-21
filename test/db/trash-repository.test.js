import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTestDatabase } from './helpers.js';
import { TrashRepository } from '../../src/db/src/repositories/trash-repository.js';
import { PersonRepository } from '../../src/db/src/repositories/person-repository.js';
import { PlaceRepository } from '../../src/db/src/repositories/place-repository.js';
import { AuditRepository } from '../../src/db/src/repositories/audit-repository.js';
import { EventRepository } from '../../src/db/src/repositories/event-repository.js';
import { ResearchRepository } from '../../src/db/src/repositories/research-repository.js';
import { MediaRepository } from '../../src/db/src/repositories/media-repository.js';

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

test('purge d’une personne emportera ses dépendances sans échouer en clé étrangère', () => {
  const database = createTestDatabase();
  const trash = new TrashRepository(database);
  const persons = new PersonRepository(database);
  const events = new EventRepository(database);

  const person = persons.create({ givenNames: 'Ada', familyName: 'Lovelace', sex: 'F' });
  events.create({
    type: 'BIRTH',
    dateText: '1815-12-10',
    datePrecision: 'EXACT',
    participants: [{ personId: person.id, role: 'PRINCIPAL' }],
  });
  persons.softDelete(person.id);

  // Avant correction, cette purge échouait sur SQLITE_CONSTRAINT_FOREIGNKEY :
  // la participation à l'événement référençait encore la personne.
  assert.equal(trash.purge('persons', person.id), true);

  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM persons').get().n, 0);
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM event_participants').get().n, 0);
  assert.deepEqual(database.pragma('foreign_key_check'), []);
});

test('purge d’une personne emporte le carnet de recherche et ses hypothèses', () => {
  const database = createTestDatabase();
  const trash = new TrashRepository(database);
  const persons = new PersonRepository(database);
  const research = new ResearchRepository(database);

  const person = persons.create({ givenNames: 'Ada', familyName: 'Lovelace', sex: 'F' });
  const notebook = research.create({
    title: 'Origine de la famille',
    content: 'Rechercher',
    personId: person.id,
  });
  const hypothesis = research.addHypothesis(notebook.id, { title: 'Hypothèse', content: 'x' });
  research.addEvidence(hypothesis.id, { stance: 'SUPPORTS', sourceId: null, content: 'preuve' });
  persons.softDelete(person.id);

  assert.equal(trash.purge('persons', person.id), true);

  // La cascade est récursive : carnet, hypothèses et preuves disparaissent.
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM research_notebook').get().n, 0);
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM research_hypotheses').get().n, 0);
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM research_evidence').get().n, 0);
  assert.deepEqual(database.pragma('foreign_key_check'), []);
});

test('purge d’un média conserve la personne dont il est le portrait', () => {
  const database = createTestDatabase();
  const trash = new TrashRepository(database);
  const media = new MediaRepository(database);
  const persons = new PersonRepository(database);

  const file = media.create({
    originalFilename: 'portrait.png',
    storedFilename: 'stocke-portrait.png',
    mimeType: 'image/png',
    sizeBytes: 2048,
    checksumSha256: 'b'.repeat(64),
  });
  const person = persons.create({ givenNames: 'Ada', familyName: 'Lovelace', sex: 'F' });
  database.prepare('UPDATE persons SET portrait_media_id = ? WHERE id = ?').run(file.id, person.id);
  media.softDelete(file.id);

  assert.equal(trash.purge('media', file.id), true);

  // La personne est conservée, son portrait simplement détaché.
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM persons').get().n, 1);
  assert.equal(
    database.prepare('SELECT portrait_media_id FROM persons WHERE id = ?').get(person.id)
      .portrait_media_id,
    null,
  );
  assert.deepEqual(database.pragma('foreign_key_check'), []);
});
