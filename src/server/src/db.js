import { openDatabase, runMigrations } from '../../db/src/index.js';

export function createDatabase(filename = process.env.GENEOAPP_DATABASE ?? 'geneoapp.sqlite') {
  const database = openDatabase(filename);
  runMigrations(database);
  return database;
}
