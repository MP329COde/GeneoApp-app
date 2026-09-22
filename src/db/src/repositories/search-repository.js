/**
 * Recherche locale en lecture seule sur l'index FTS5 (search_index),
 * alimenté par les dépôts sources et médias. Aucun appel réseau.
 */
export class SearchRepository {
  constructor(database) {
    this.database = database;
  }

  search(query, { entityTypes = null, limit = 25 } = {}) {
    const typeClause =
      entityTypes && entityTypes.length > 0
        ? 'AND entity_type IN (' + entityTypes.map(() => '?').join(',') + ')'
        : '';
    const params = [query, ...(entityTypes ?? []), limit];

    return this.database
      .prepare(
        `SELECT entity_type, entity_id, title, snippet(search_index, 3, '[', ']', '…', 12) AS excerpt, rank
         FROM search_index
         WHERE search_index MATCH ? ${typeClause}
         ORDER BY rank
         LIMIT ?`,
      )
      .all(...params);
  }
}
