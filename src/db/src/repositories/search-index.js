import { recordSearchIndexChange } from '../history/undo-history.js';

/**
 * Maintenance de l'index de recherche locale (SQLite FTS5). Appelé
 * explicitement par les dépôts métier à chaque écriture, dans la même
 * transaction que la mutation qu'il reflète.
 *
 * FTS5 n'accepte ni trigger ni index secondaire, et ses colonnes
 * `entity_type`/`entity_id` sont UNINDEXED : retrouver la ligne d'une entité
 * par couple imposerait un parcours complet de l'index. La table
 * `search_index_map` tient donc la correspondance (entité → rowid FTS5),
 * ce qui permet des accès directs.
 *
 * La table de correspondance est un miroir de l'index : si elle est absente
 * (base antérieure à la migration 0022, ou migration non encore appliquée),
 * le dépôt retombe sur le parcours complet, qui reste correct — seulement
 * plus lent.
 */

// Les requêtes sont préparées une seule fois par base : l'indexation est
// appelée à chaque écriture de fiche, et la préparation répétée coûtait plus
// cher que la requête elle-même.
const statementCache = new WeakMap();

function cached(database, sql) {
  let statements = statementCache.get(database);
  if (!statements) {
    statements = new Map();
    statementCache.set(database, statements);
  }
  let statement = statements.get(sql);
  if (!statement) {
    statement = database.prepare(sql);
    statements.set(sql, statement);
  }
  return statement;
}

function hasMap(database) {
  return (
    cached(
      database,
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'search_index_map'",
    ).get() !== undefined
  );
}

/** Rowid des lignes de l'index décrivant une entité donnée. */
function rowidsOf(database, entityType, entityId) {
  if (hasMap(database)) {
    return cached(
      database,
      'SELECT rowid FROM search_index_map WHERE entity_type = ? AND entity_id = ?',
    )
      .all(entityType, entityId)
      .map((row) => row.rowid);
  }
  // Repli : parcours complet de l'index.
  return cached(database, 'SELECT rowid FROM search_index WHERE entity_type = ? AND entity_id = ?')
    .all(entityType, entityId)
    .map((row) => row.rowid);
}

function snapshotIndex(database, entityType, entityId) {
  const rowids = rowidsOf(database, entityType, entityId);
  if (rowids.length === 0) return [];
  const placeholders = rowids.map(() => '?').join(',');
  return cached(
    database,
    `SELECT rowid AS rowid, entity_type, entity_id, title, body
     FROM search_index WHERE rowid IN (${placeholders})`,
  ).all(...rowids);
}

function logRemovals(database, rows) {
  for (const { rowid, ...row } of rows) {
    recordSearchIndexChange(database, { operation: 'DELETE', rowId: rowid, oldRow: row });
  }
}

function forgetInMap(database, entityType, entityId) {
  if (!hasMap(database)) return;
  cached(database, 'DELETE FROM search_index_map WHERE entity_type = ? AND entity_id = ?').run(
    entityType,
    entityId,
  );
}

function rememberInMap(database, entityType, entityId, rowid) {
  if (!hasMap(database)) return;
  cached(
    database,
    `INSERT INTO search_index_map (entity_type, entity_id, rowid)
     VALUES (?, ?, ?)
     ON CONFLICT (entity_type, entity_id) DO UPDATE SET rowid = excluded.rowid`,
  ).run(entityType, entityId, rowid);
}

/** Supprime les lignes d'index d'une entité, par accès direct au rowid. */
function deleteIndexRows(database, entityType, entityId) {
  for (const rowid of rowidsOf(database, entityType, entityId)) {
    cached(database, 'DELETE FROM search_index WHERE rowid = ?').run(rowid);
  }
}

export function indexDocument(database, { entityType, entityId, title, body = '' }) {
  logRemovals(database, snapshotIndex(database, entityType, entityId));

  // La suppression passe par les rowids connus : accès direct, au lieu d'un
  // parcours complet de l'index à chaque écriture de fiche.
  deleteIndexRows(database, entityType, entityId);
  forgetInMap(database, entityType, entityId);

  // `RETURNING rowid` ne fonctionne pas sur une table FTS5 (il renvoie -1) :
  // le rowid est donc récupéré via `lastInsertRowid`, qui reflète bien la
  // ligne insérée (vérifié y compris après une suppression intermédiaire).
  const result = cached(
    database,
    `INSERT INTO search_index (entity_type, entity_id, title, body)
     VALUES (@entityType, @entityId, @title, @body)`,
  ).run({ entityType, entityId, title: title ?? '', body: body ?? '' });
  rememberInMap(database, entityType, entityId, result.lastInsertRowid);

  const inserted = cached(
    database,
    'SELECT rowid AS rowid, entity_type, entity_id, title, body FROM search_index WHERE rowid = ?',
  ).get(result.lastInsertRowid);
  if (inserted) {
    const { rowid, ...values } = inserted;
    recordSearchIndexChange(database, { operation: 'INSERT', rowId: rowid, newRow: values });
  }
}

export function removeFromIndex(database, { entityType, entityId }) {
  logRemovals(database, snapshotIndex(database, entityType, entityId));

  deleteIndexRows(database, entityType, entityId);
  forgetInMap(database, entityType, entityId);
}
