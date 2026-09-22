const NOW_EXPRESSION = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

/**
 * Exécute `fn` dans une transaction SQLite. En cas d'exception, better-sqlite3
 * annule automatiquement la transaction avant de la propager.
 */
export function withTransaction(database, fn) {
  return database.transaction(fn)();
}

/**
 * Enregistre une entrée d'audit pour une mutation effectuée sur `tableName`.
 * Toujours appelé à l'intérieur de la même transaction que la mutation
 * qu'il journalise.
 */
export function recordAudit(
  database,
  { tableName, rowId, operation, changes = null, performedBy = null },
) {
  database
    .prepare(
      `INSERT INTO audit_log (table_name, row_id, operation, changes, performed_by)
       VALUES (@tableName, @rowId, @operation, @changes, @performedBy)`,
    )
    .run({
      tableName,
      rowId,
      operation,
      changes: changes === null ? null : JSON.stringify(changes),
      performedBy,
    });
}

export { NOW_EXPRESSION };
