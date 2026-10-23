import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTestDatabase } from './helpers.js';
import { ResearchRepository } from '../../src/db/src/repositories/research-repository.js';
import { AuditRepository } from '../../src/db/src/repositories/audit-repository.js';

test('remove est une suppression logique : le carnet reste en base', () => {
  const database = createTestDatabase();
  const repository = new ResearchRepository(database);

  const notebook = repository.create({ title: 'Origine de la famille', content: 'Rechercher' });

  assert.equal(repository.remove(notebook.id), true);

  // Le carnet disparaît des vues, mais la ligne est toujours là : c'est ce
  // qui permet de la restaurer depuis la corbeille.
  assert.equal(repository.findById(notebook.id), null);
  const raw = database
    .prepare('SELECT deleted_at FROM research_notebook WHERE id = ?')
    .get(notebook.id);
  assert.ok(raw.deleted_at);
  assert.deepEqual(repository.list(), []);
});

test('remove journalise la suppression', () => {
  const database = createTestDatabase();
  const repository = new ResearchRepository(database);
  const audit = new AuditRepository(database);

  const notebook = repository.create({ title: 'Origine de la famille', content: 'Rechercher' });
  repository.remove(notebook.id, { performedBy: 'tester' });

  const entries = audit.findForEntity('research_notebook', notebook.id);
  assert.ok(entries.some((entry) => entry.operation === 'DELETE'));
});

test('restore annule la suppression logique et journalise la restauration', () => {
  const database = createTestDatabase();
  const repository = new ResearchRepository(database);
  const audit = new AuditRepository(database);

  const notebook = repository.create({ title: 'Origine de la famille', content: 'Rechercher' });
  repository.remove(notebook.id);

  const restored = repository.restore(notebook.id, { performedBy: 'tester' });

  assert.equal(restored.id, notebook.id);
  assert.equal(restored.deleted_at, null);
  assert.equal(repository.findById(notebook.id).deleted_at, null);
  assert.equal(repository.list().length, 1);

  const entries = audit.findForEntity('research_notebook', notebook.id);
  assert.ok(entries.some((entry) => entry.operation === 'RESTORE'));
});

test('restore refuse un carnet inexistant ou non supprimé', () => {
  const database = createTestDatabase();
  const repository = new ResearchRepository(database);

  const notebook = repository.create({ title: 'Origine de la famille', content: 'Rechercher' });

  assert.throws(() => repository.restore(9999), /introuvable/);
  assert.throws(() => repository.restore(notebook.id), /non supprimée/);
});

test('findById avec includeDeleted retrouve un carnet supprimé', () => {
  const database = createTestDatabase();
  const repository = new ResearchRepository(database);

  const notebook = repository.create({ title: 'Origine de la famille', content: 'Rechercher' });
  repository.remove(notebook.id);

  assert.equal(repository.findById(notebook.id), null);
  const deleted = repository.findById(notebook.id, { includeDeleted: true });
  assert.equal(deleted.id, notebook.id);
  assert.ok(deleted.deleted_at);
});
