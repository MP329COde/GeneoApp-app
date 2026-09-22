/**
 * Maintenance de l'index de recherche locale (SQLite FTS5). Appelé
 * explicitement par les dépôts métier à chaque écriture, dans la même
 * transaction que la mutation qu'il reflète.
 */
export function indexDocument(database, { entityType, entityId, title, body = '' }) {
  database
    .prepare('DELETE FROM search_index WHERE entity_type = ? AND entity_id = ?')
    .run(entityType, entityId);
  database
    .prepare(
      `INSERT INTO search_index (entity_type, entity_id, title, body)
       VALUES (@entityType, @entityId, @title, @body)`,
    )
    .run({ entityType, entityId, title: title ?? '', body: body ?? '' });
}

export function removeFromIndex(database, { entityType, entityId }) {
  database
    .prepare('DELETE FROM search_index WHERE entity_type = ? AND entity_id = ?')
    .run(entityType, entityId);
}
