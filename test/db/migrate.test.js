import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openDatabase } from '../../src/db/src/database.js';
import { runMigrations } from '../../src/db/src/migrate.js';

test('runMigrations crée toutes les tables attendues', () => {
  const database = openDatabase(':memory:');
  const applied = runMigrations(database);

  assert.ok(applied.length > 0);

  const tables = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((row) => row.name);

  for (const expected of [
    'persons',
    'places',
    'events',
    'event_participants',
    'unions',
    'union_partners',
    'parentages',
    'sources',
    'citations',
    'audit_log',
    'schema_migrations',
  ]) {
    assert.ok(tables.includes(expected), `table manquante : ${expected}`);
  }

  database.close();
});

test('runMigrations est idempotent', () => {
  const database = openDatabase(':memory:');
  runMigrations(database);
  const secondRun = runMigrations(database);

  assert.deepEqual(secondRun, []);

  database.close();
});
