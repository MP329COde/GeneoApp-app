import { openDatabase } from '../../src/db/src/database.js';
import { runMigrations } from '../../src/db/src/migrate.js';

export function createTestDatabase() {
  const database = openDatabase(':memory:');
  runMigrations(database);
  return database;
}
