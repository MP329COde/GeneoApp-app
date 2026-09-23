import { openDatabase, runMigrations } from '../../db/src/index.js';

export function createDatabase(
  filename = process.env.GENEOAPP_DATABASE ?? 'geneoapp.sqlite',
  { backupDir = null } = {},
) {
  const database = openDatabase(filename);
  runMigrations(database, { backupDir });
  return database;
}
