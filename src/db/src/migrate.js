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
    // Une migration qui reconstruit une table (procédure SQLite : créer,
    // copier, supprimer, renommer) échoue sur « DROP TABLE » si les clés
    // étrangères sont actives : la table fille qui référence la table
    // reconstruite bloque la suppression. SQLite impose de désactiver les
    // clés étrangères avant la transaction — le PRAGMA est sans effet une
    // fois dans une transaction, d'où le réglage effectué ici, avant.
    if (rebuildsTable(sql)) {
      applyWithForeignKeysDisabled(database, applyMigration);
    } else {
      applyMigration();
    }
  }

  // Régénérés à chaque ouverture : couvrent aussi les colonnes ajoutées.
  installUndoTriggers(database);

  return pending;
}

/**
 * Une migration reconstruit une table si elle supprime une table existante
 * (le schéma définitif la recrée ensuite sous un autre nom).
 */
function rebuildsTable(sql) {
  return /\bDROP\s+TABLE\b/i.test(sql);
}

/**
 * Exécute une migration avec les clés étrangères désactivées, puis les
 * réactive et vérifie l'intégrité référentielle. La désactivation n'est
 * effective que hors transaction : elle est donc positionnée avant l'ouverture
 * de la transaction de migration, et annulée quoi qu'il arrive.
 */
function applyWithForeignKeysDisabled(database, applyMigration) {
  database.pragma('foreign_keys = OFF');
  try {
    applyMigration();
  } finally {
    database.pragma('foreign_keys = ON');
  }
  // Une reconstruction de table laisse parfois des références pointant vers
  // l'ancienne table : on le détecte plutôt que de laisser une base
  // incohérente en silence.
  const violations = database.pragma('foreign_key_check');
  if (violations.length > 0) {
    throw new Error(
      `Intégrité référentielle rompue après migration : ${violations.length} violation(s) — ${JSON.stringify(violations.slice(0, 5))}`,
    );
  }
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
