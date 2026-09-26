import Database from 'better-sqlite3';
import { yearOf } from './dates/genealogy-date.js';

export function openDatabase(filename = ':memory:') {
  const database = new Database(filename);
  database.pragma('foreign_keys = ON');
  database.pragma('journal_mode = WAL');
  // Exposée aux migrations SQL (ex. 0019) et requêtes ad hoc : lit une date
  // généalogique (français, anglais, GEDCOM…) et renvoie son année
  // représentative, ou NULL si non interprétable.
  database.function('GENEALOGY_YEAR', (dateText) => yearOf(dateText ?? ''));
  return database;
}
