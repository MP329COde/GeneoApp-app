import { fileURLToPath } from 'node:url';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { openDatabase } from './database.js';
import { installUndoTriggers } from './history/undo-history.js';
import { backupBeforeMigration } from './backup/pre-migration-backup.js';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

function ensureMigrationsTable(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
  `);
}

function listMigrationFiles(migrationsDir = MIGRATIONS_DIR) {
  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();
}

/**
 * Applique, dans une transaction par fichier, les migrations SQL non
 * encore enregistrées dans schema_migrations. Idempotent.
 */
export function runMigrations(database, { migrationsDir = MIGRATIONS_DIR, backupDir = null } = {}) {
  ensureMigrationsTable(database);

  const applied = new Set(
    database
      .prepare('SELECT name FROM schema_migrations')
      .all()
      .map((row) => row.name),
  );

  const pending = listMigrationFiles(migrationsDir).filter((name) => !applied.has(name));
  // Base existante (déjà migrée au moins une fois) : copie avant d'y toucher.
  if (applied.size > 0) backupBeforeMigration(database, backupDir, pending);

  for (const name of pending) {
    const sql = readFileSync(path.join(migrationsDir, name), 'utf8');
    const applyMigration = database.transaction(() => {
      database.exec(sql);
      database.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(name);
    });
    applyMigration();
  }

  // Régénérés à chaque ouverture : couvrent aussi les colonnes ajoutées.
  installUndoTriggers(database);

  return pending;
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
  const database = openDatabase(process.env.GENEOAPP_DATABASE ?? 'geneoapp.sqlite');
  const applied = runMigrations(database);
  database.close();
  if (applied.length > 0) {
    console.log(`Migrations appliquées : ${applied.join(', ')}`);
  } else {
    console.log('Aucune migration à appliquer.');
  }
}
