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
import { UnionRepository } from '../../src/db/src/repositories/union-repository.js';
import { ParentageRepository } from '../../src/db/src/repositories/parentage-repository.js';
import { NoteRepository } from '../../src/db/src/repositories/note-repository.js';

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

test('un carnet de recherche supprimé apparaît dans la corbeille', () => {
  const database = createTestDatabase();
  const trash = new TrashRepository(database);
  const research = new ResearchRepository(database);

  const notebook = research.create({ title: 'Origine de la famille', content: 'Rechercher' });
  research.remove(notebook.id);

  // Avant correction, `research_notebook` n'était pas dans TRASH_TABLES : le
  // carnet disparaissait des vues sans jamais être proposé à la restauration.
  const entries = trash.list();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].table, 'research_notebook');
  assert.equal(entries[0].id, notebook.id);
  assert.equal(entries[0].label, 'Origine de la famille');
  assert.ok(entries[0].deletedAt);
});

test('un carnet de recherche supprimé sort de la corbeille une fois restauré', () => {
  const database = createTestDatabase();
  const trash = new TrashRepository(database);
  const research = new ResearchRepository(database);

  const notebook = research.create({ title: 'Origine de la famille', content: 'Rechercher' });
  research.remove(notebook.id);
  assert.equal(trash.list().length, 1);

  const restored = research.restore(notebook.id);

  assert.equal(restored.id, notebook.id);
  assert.equal(restored.deleted_at, null);
  assert.deepEqual(trash.list(), []);
  // Le carnet redevient visible dans la liste des carnets.
  assert.equal(research.list().length, 1);
});

test('la restauration d’un carnet rend ses hypothèses, tâches et preuves visibles', () => {
  const database = createTestDatabase();
  const research = new ResearchRepository(database);

  const notebook = research.create({ title: 'Origine de la famille', content: 'Rechercher' });
  const hypothesis = research.addHypothesis(notebook.id, { title: 'Hypothèse', content: 'x' });
  research.addEvidence(hypothesis.id, { stance: 'SUPPORTS', sourceId: null, content: 'preuve' });
  research.addTask(notebook.id, { title: 'Tâche', content: 'y' });

  research.remove(notebook.id);

  // Le carnet seul est supprimé : ses enfants restent en base mais sont
  // inaccessibles tant que le carnet parent est supprimé.
  assert.equal(research.findDetailed(notebook.id), null);

  const restored = research.restore(notebook.id);

  assert.equal(restored.hypotheses.length, 1);
  assert.equal(restored.hypotheses[0].evidence.length, 1);
  assert.equal(restored.tasks.length, 1);
});

test('la restauration d’un carnet ne ressuscite pas un enfant supprimé séparément', () => {
  const database = createTestDatabase();
  const research = new ResearchRepository(database);

  const notebook = research.create({ title: 'Origine de la famille', content: 'Rechercher' });
  const kept = research.addHypothesis(notebook.id, { title: 'Conservée', content: 'x' });
  const removed = research.addHypothesis(notebook.id, { title: 'Supprimée', content: 'y' });
  research.removeHypothesis(removed.id);

  research.remove(notebook.id);
  const restored = research.restore(notebook.id);

  // L'hypothèse écartée par l'utilisateur reste écartée : la restauration
  // ne ressuscite que le carnet, elle ne défait pas les suppressions faites
  // séparément, qui seraient sinon impossibles à distinguer du carnet.
  assert.equal(restored.hypotheses.length, 1);
  assert.equal(restored.hypotheses[0].id, kept.id);
  assert.equal(research.findHypothesis(removed.id), null);
});

test('restore refuse un carnet absent ou non supprimé', () => {
  const database = createTestDatabase();
  const research = new ResearchRepository(database);

  const notebook = research.create({ title: 'Origine de la famille', content: 'Rechercher' });

  assert.throws(() => research.restore(9999));
  assert.throws(() => research.restore(notebook.id));
});

test('purge d’un carnet de recherche emporte ses hypothèses, tâches et preuves', () => {
  const database = createTestDatabase();
  const trash = new TrashRepository(database);
  const research = new ResearchRepository(database);

  const notebook = research.create({ title: 'Origine de la famille', content: 'Rechercher' });
  const hypothesis = research.addHypothesis(notebook.id, { title: 'Hypothèse', content: 'x' });
  research.addEvidence(hypothesis.id, { stance: 'SUPPORTS', sourceId: null, content: 'preuve' });
  research.addTask(notebook.id, { title: 'Tâche', content: 'y' });
  research.remove(notebook.id);

  // Avant correction, la purge échouait : le carnet n'était pas dans
  // TRASH_TABLES, donc hors du périmètre de la corbeille.
  assert.equal(trash.purge('research_notebook', notebook.id), true);

  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM research_notebook').get().n, 0);
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM research_hypotheses').get().n, 0);
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM research_tasks').get().n, 0);
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM research_evidence').get().n, 0);
  assert.deepEqual(database.pragma('foreign_key_check'), []);
});

test('purge d’un carnet de recherche journalise la suppression définitive', () => {
  const database = createTestDatabase();
  const trash = new TrashRepository(database);
  const research = new ResearchRepository(database);
  const audit = new AuditRepository(database);

  const notebook = research.create({ title: 'Origine de la famille', content: 'Rechercher' });
  research.remove(notebook.id);

  trash.purge('research_notebook', notebook.id, { performedBy: 'tester' });

  const entries = audit.findForEntity('research_notebook', notebook.id);
  assert.ok(entries.some((e) => e.operation === 'DELETE' && e.changes?.includes('purged')));
});

test('purge d’une union et d’une filiation emporte leurs notes', () => {
  const database = createTestDatabase();
  const trash = new TrashRepository(database);
  const persons = new PersonRepository(database);
  const unions = new UnionRepository(database);
  const parentages = new ParentageRepository(database);
  const notes = new NoteRepository(database);

  const ada = persons.create({ givenNames: 'Ada', familyName: 'Lovelace', sex: 'F' });
  const byron = persons.create({ givenNames: 'Byron', familyName: 'King', sex: 'M' });
  const child = persons.create({ givenNames: 'Anne', familyName: 'King', sex: 'F' });

  const union = unions.create({ type: 'MARRIAGE', partnerIds: [ada.id, byron.id] });
  const parentage = parentages.create({
    childId: child.id,
    parentId: ada.id,
    parentRole: 'MOTHER',
  });

  notes.create({ entityType: 'UNION', entityId: union.id, body: 'Note sur le mariage' });
  notes.create({ entityType: 'PARENTAGE', entityId: parentage.id, body: 'Note sur la filiation' });
  notes.create({ entityType: 'PERSON', entityId: ada.id, body: 'Note sur la personne' });

  unions.softDelete(union.id);
  assert.equal(trash.purge('unions', union.id), true);

  // La note d'union disparaît avec elle ; les autres sont intactes.
  assert.equal(
    database.prepare("SELECT COUNT(*) AS n FROM notes WHERE entity_type = 'UNION'").get().n,
    0,
  );
  assert.equal(
    database.prepare("SELECT COUNT(*) AS n FROM notes WHERE entity_type = 'PARENTAGE'").get().n,
    1,
  );
  assert.equal(
    database.prepare("SELECT COUNT(*) AS n FROM notes WHERE entity_type = 'PERSON'").get().n,
    1,
  );
  assert.deepEqual(database.pragma('foreign_key_check'), []);

  parentages.softDelete(parentage.id);
  assert.equal(trash.purge('parentages', parentage.id), true);

  assert.equal(
    database.prepare("SELECT COUNT(*) AS n FROM notes WHERE entity_type = 'PARENTAGE'").get().n,
    0,
  );
  assert.deepEqual(database.pragma('foreign_key_check'), []);
});
