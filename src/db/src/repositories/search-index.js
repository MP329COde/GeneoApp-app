import { recordSearchIndexChange } from '../history/undo-history.js';

function snapshotIndex(database, entityType, entityId) {
  return database
    .prepare(
      'SELECT rowid AS rowid, entity_type, entity_id, title, body FROM search_index WHERE entity_type = ? AND entity_id = ?',
    )
    .all(entityType, entityId);
}

function logRemovals(database, rows) {
  for (const { rowid, ...row } of rows) {
    recordSearchIndexChange(database, { operation: 'DELETE', rowId: rowid, oldRow: row });
  }
}

/**
 * Maintenance de l'index de recherche locale (SQLite FTS5). Appelé
 * explicitement par les dépôts métier à chaque écriture, dans la même
 * transaction que la mutation qu'il reflète.
 */
export function indexDocument(database, { entityType, entityId, title, body = '' }) {
  logRemovals(database, snapshotIndex(database, entityType, entityId));
  database
    .prepare('DELETE FROM search_index WHERE entity_type = ? AND entity_id = ?')
    .run(entityType, entityId);
  database
    .prepare(
      `INSERT INTO search_index (entity_type, entity_id, title, body)
       VALUES (@entityType, @entityId, @title, @body)`,
    )
    .run({ entityType, entityId, title: title ?? '', body: body ?? '' });
  const [inserted] = snapshotIndex(database, entityType, entityId);
  if (inserted) {
    const { rowid, ...row } = inserted;
    recordSearchIndexChange(database, { operation: 'INSERT', rowId: rowid, newRow: row });
  }
}

export function removeFromIndex(database, { entityType, entityId }) {
  logRemovals(database, snapshotIndex(database, entityType, entityId));
  database
    .prepare('DELETE FROM search_index WHERE entity_type = ? AND entity_id = ?')
    .run(entityType, entityId);
}
