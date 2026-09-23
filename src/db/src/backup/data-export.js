import { withTransaction, recordAudit } from '../repositories/base-repository.js';

// Ordre de dépendance (FK) croissant : utilisé tel quel pour la ré-insertion
// et inversé pour la purge avant import.
export const EXPORTABLE_TABLES = [
  'places',
  'persons',
  'sources',
  'citations',
  'events',
  'event_participants',
  'unions',
  'union_partners',
  'parentages',
  'media',
  'media_regions',
  'notes',
  'research_notebook',
  'research_hypotheses',
  'research_tasks',
  'research_evidence',
  'search_index',
  'local_accounts',
  'audit_log',
];

export const BACKUP_FORMAT = 'geneoapp-backup';
export const BACKUP_FORMAT_VERSION = 1;

/**
 * Extrait une image JSON complète et portable de la base (sauvegarde
 * logique). Ne contient aucune donnée dérivable (schema_migrations exclue).
 */
export function exportDatabaseToJson(database) {
  const tables = {};
  for (const table of EXPORTABLE_TABLES) {
    tables[table] = database.prepare(`SELECT * FROM ${table}`).all();
  }

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    tables,
  };
}

/**
 * Réimporte une image JSON dans la base courante, de façon atomique :
 * purge + ré-insertion s'effectuent dans une unique transaction, avec
 * vérification d'intégrité référentielle avant validation. En cas d'échec
 * (format invalide, violation FK), la base reste inchangée.
 */
export function importDatabaseFromJson(database, dump, { performedBy = null } = {}) {
  if (!dump || dump.format !== BACKUP_FORMAT) {
    throw new Error('Format de sauvegarde logique invalide');
  }
  if (dump.version !== BACKUP_FORMAT_VERSION) {
    throw new Error(`Version de sauvegarde logique non supportée : ${dump.version}`);
  }
  if (!dump.tables || typeof dump.tables !== 'object') {
    throw new Error('Sauvegarde logique invalide : "tables" manquant');
  }

  const unknownTables = Object.keys(dump.tables).filter((t) => !EXPORTABLE_TABLES.includes(t));
  if (unknownTables.length > 0) {
    throw new Error(`Sauvegarde logique invalide : tables inconnues (${unknownTables.join(', ')})`);
  }

  // PRAGMA foreign_keys ne peut être modifié dans une transaction : on le
  // désactive avant, puis on la réactive systématiquement après, succès ou
  // échec, pour ne jamais laisser la connexion dans un état dégradé.
  database.pragma('foreign_keys = OFF');
  try {
    withTransaction(database, () => {
      for (const table of [...EXPORTABLE_TABLES].reverse()) {
        database.prepare(`DELETE FROM ${table}`).run();
      }

      for (const table of EXPORTABLE_TABLES) {
        const rows = dump.tables[table] ?? [];
        if (rows.length === 0) continue;

        const columns = Object.keys(rows[0]);
        const insert = database.prepare(
          `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map((c) => `@${c}`).join(', ')})`,
        );
        for (const row of rows) {
          insert.run(row);
        }
      }

      const violations = database.pragma('foreign_key_check');
      if (violations.length > 0) {
        throw new Error(
          `Sauvegarde logique invalide : violations d'intégrité référentielle (${violations.length})`,
        );
      }

      recordAudit(database, {
        tableName: 'database',
        rowId: 0,
        operation: 'RESTORE',
        changes: { tables: Object.keys(dump.tables), exportedAt: dump.exportedAt },
        performedBy,
      });
    });
  } finally {
    database.pragma('foreign_keys = ON');
  }
}
