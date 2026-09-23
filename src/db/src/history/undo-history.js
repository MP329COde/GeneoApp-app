/**
 * Historique annulable générique, fondé sur des triggers SQLite : aucune
 * modification des dépôts métier n'est nécessaire, et toute table métier
 * future est couverte automatiquement à la prochaine ouverture.
 */

// Tables techniques exclues : journal d'audit (append-only), comptes et
// sessions (sécurité), historique lui-même, index FTS (journalisé à part).
const EXCLUDED_TABLES = new Set([
  'audit_log',
  'local_accounts',
  'schema_migrations',
  'undo_groups',
  'undo_entries',
  'undo_state',
  'sqlite_sequence',
  // Index de documents : reconstructible, volumineux, hors historique (ADR 0011).
  'index_sources',
  'indexed_documents',
  'index_settings',
  'index_runs',
]);

const HISTORY_LIMIT = 200;
const SEARCH_INDEX = 'search_index';

function quote(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function undoableTables(database) {
  return database
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'search_index%'
         AND name NOT LIKE 'documents_fts%'`,
    )
    .all()
    .map((row) => row.name)
    .filter((name) => !EXCLUDED_TABLES.has(name));
}

function columnsOf(database, table) {
  return database
    .prepare(`PRAGMA table_info(${quote(table)})`)
    .all()
    .map((column) => column.name);
}

function jsonObject(alias, columns) {
  return `json_object(${columns.map((c) => `'${c.replaceAll("'", "''")}', ${alias}.${quote(c)}`).join(', ')})`;
}

/** (Ré)installe les triggers d'historique sur toutes les tables métier. */
export function installUndoTriggers(database) {
  const hasHistory = database
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'undo_state'")
    .get();
  if (!hasHistory) return;

  const install = database.transaction(() => {
    for (const { name } of database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'undo_%'")
      .all()) {
      database.exec(`DROP TRIGGER IF EXISTS ${quote(name)}`);
    }
    const active = 'WHEN (SELECT current_group FROM undo_state WHERE id = 1) IS NOT NULL';
    const group = '(SELECT current_group FROM undo_state WHERE id = 1)';
    for (const table of undoableTables(database)) {
      const columns = columnsOf(database, table);
      if (!columns.includes('id')) continue;
      const t = quote(table);
      const literal = `'${table.replaceAll("'", "''")}'`;
      database.exec(`
        CREATE TRIGGER ${quote(`undo_${table}_insert`)} AFTER INSERT ON ${t} ${active}
        BEGIN
          INSERT INTO undo_entries (group_id, table_name, row_id, operation, new_row)
          VALUES (${group}, ${literal}, NEW.id, 'INSERT', ${jsonObject('NEW', columns)});
        END;
        CREATE TRIGGER ${quote(`undo_${table}_update`)} AFTER UPDATE ON ${t} ${active}
        BEGIN
          INSERT INTO undo_entries (group_id, table_name, row_id, operation, old_row, new_row)
          VALUES (${group}, ${literal}, NEW.id, 'UPDATE', ${jsonObject('OLD', columns)}, ${jsonObject('NEW', columns)});
        END;
        CREATE TRIGGER ${quote(`undo_${table}_delete`)} AFTER DELETE ON ${t} ${active}
        BEGIN
          INSERT INTO undo_entries (group_id, table_name, row_id, operation, old_row)
          VALUES (${group}, ${literal}, OLD.id, 'DELETE', ${jsonObject('OLD', columns)});
        END;
      `);
    }
  });
  install();
}

function currentGroup(database) {
  return database.prepare('SELECT current_group FROM undo_state WHERE id = 1').get()?.current_group;
}

/**
 * Journalise une écriture de l'index FTS5 (qui n'accepte pas de trigger),
 * pour que l'annulation restaure aussi les résultats de recherche.
 */
export function recordSearchIndexChange(database, { operation, rowId, oldRow, newRow }) {
  const hasHistory = database
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'undo_state'")
    .get();
  if (!hasHistory) return;
  const group = currentGroup(database);
  if (group === null || group === undefined) return;
  database
    .prepare(
      `INSERT INTO undo_entries (group_id, table_name, row_id, operation, old_row, new_row)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      group,
      SEARCH_INDEX,
      rowId,
      operation,
      oldRow ? JSON.stringify(oldRow) : null,
      newRow ? JSON.stringify(newRow) : null,
    );
}

function applyRow(database, table, operation, row, rowId) {
  const t = quote(table);
  const idColumn = table === SEARCH_INDEX ? 'rowid' : 'id';
  if (operation === 'delete') {
    database.prepare(`DELETE FROM ${t} WHERE ${idColumn} = ?`).run(rowId);
    return;
  }
  const values = { ...row };
  if (table === SEARCH_INDEX) {
    values.rowid = rowId;
    delete values.id;
  }
  const columns = Object.keys(values);
  const placeholders = columns.map((c) => `@${c}`);
  if (operation === 'insert') {
    database
      .prepare(
        `INSERT INTO ${t} (${columns.map(quote).join(', ')}) VALUES (${placeholders.join(', ')})`,
      )
      .run(values);
  } else {
    database
      .prepare(
        `UPDATE ${t} SET ${columns
          .filter((c) => c !== idColumn)
          .map((c) => `${quote(c)} = @${c}`)
          .join(', ')} WHERE ${idColumn} = @${idColumn}`,
      )
      .run(values);
  }
}

/**
 * Service d'historique : regroupe les écritures d'une action, puis permet de
 * les annuler et de les rétablir (historique linéaire, comme un éditeur).
 */
export class UndoHistory {
  constructor(database, { limit = HISTORY_LIMIT } = {}) {
    this.database = database;
    this.limit = limit;
  }

  begin(label, performedBy = null) {
    if (currentGroup(this.database)) return null; // action imbriquée : même groupe
    const id = this.database
      .prepare('INSERT INTO undo_groups (label, performed_by) VALUES (?, ?)')
      .run(String(label).slice(0, 200), performedBy).lastInsertRowid;
    this.database.prepare('UPDATE undo_state SET current_group = ? WHERE id = 1').run(id);
    return Number(id);
  }

  end(groupId) {
    if (!groupId) return;
    this.database.prepare('UPDATE undo_state SET current_group = NULL WHERE id = 1').run();
    const count = this.database
      .prepare('SELECT COUNT(*) AS n FROM undo_entries WHERE group_id = ?')
      .get(groupId).n;
    if (count === 0) {
      this.database.prepare('DELETE FROM undo_groups WHERE id = ?').run(groupId);
      return;
    }
    // Une nouvelle action invalide ce qui avait été annulé (pas de branche).
    const discard = this.database.transaction(() => {
      const undone = this.database
        .prepare('SELECT id FROM undo_groups WHERE undone = 1 AND id < ?')
        .all(groupId)
        .map((row) => row.id);
      for (const id of undone) {
        this.database.prepare('DELETE FROM undo_entries WHERE group_id = ?').run(id);
        this.database.prepare('DELETE FROM undo_groups WHERE id = ?').run(id);
      }
      const excess = this.database
        .prepare('SELECT id FROM undo_groups ORDER BY id DESC LIMIT -1 OFFSET ?')
        .all(this.limit)
        .map((row) => row.id);
      for (const id of excess) {
        this.database.prepare('DELETE FROM undo_entries WHERE group_id = ?').run(id);
        this.database.prepare('DELETE FROM undo_groups WHERE id = ?').run(id);
      }
    });
    discard();
  }

  /** Exécute `fn` comme une action annulable unique. */
  record(label, fn, performedBy = null) {
    const groupId = this.begin(label, performedBy);
    try {
      return fn();
    } finally {
      this.end(groupId);
    }
  }

  status() {
    const undo = this.database
      .prepare(
        'SELECT id, label, created_at FROM undo_groups WHERE undone = 0 ORDER BY id DESC LIMIT 1',
      )
      .get();
    const redo = this.database
      .prepare(
        'SELECT id, label, created_at FROM undo_groups WHERE undone = 1 ORDER BY id ASC LIMIT 1',
      )
      .get();
    return {
      canUndo: Boolean(undo),
      canRedo: Boolean(redo),
      undoLabel: undo?.label ?? null,
      redoLabel: redo?.label ?? null,
    };
  }

  list(limit = 50) {
    return this.database
      .prepare(
        `SELECT g.id, g.label, g.performed_by AS performedBy, g.created_at AS createdAt,
                g.undone, COUNT(e.id) AS changes
         FROM undo_groups g LEFT JOIN undo_entries e ON e.group_id = g.id
         GROUP BY g.id ORDER BY g.id DESC LIMIT ?`,
      )
      .all(limit)
      .map((row) => ({ ...row, undone: row.undone === 1 }));
  }

  replay(groupId, direction) {
    const entries = this.database
      .prepare(
        `SELECT * FROM undo_entries WHERE group_id = ? ORDER BY id ${direction === 'undo' ? 'DESC' : 'ASC'}`,
      )
      .all(groupId);
    for (const entry of entries) {
      const oldRow = entry.old_row ? JSON.parse(entry.old_row) : null;
      const newRow = entry.new_row ? JSON.parse(entry.new_row) : null;
      if (direction === 'undo') {
        if (entry.operation === 'INSERT')
          applyRow(this.database, entry.table_name, 'delete', null, entry.row_id);
        else if (entry.operation === 'UPDATE')
          applyRow(this.database, entry.table_name, 'update', oldRow, entry.row_id);
        else applyRow(this.database, entry.table_name, 'insert', oldRow, entry.row_id);
      } else if (entry.operation === 'INSERT') {
        applyRow(this.database, entry.table_name, 'insert', newRow, entry.row_id);
      } else if (entry.operation === 'UPDATE') {
        applyRow(this.database, entry.table_name, 'update', newRow, entry.row_id);
      } else {
        applyRow(this.database, entry.table_name, 'delete', null, entry.row_id);
      }
    }
  }

  undo() {
    const group = this.database
      .prepare('SELECT id, label FROM undo_groups WHERE undone = 0 ORDER BY id DESC LIMIT 1')
      .get();
    if (!group) return { undone: null, ...this.status() };
    this.database.transaction(() => {
      this.replay(group.id, 'undo');
      this.database.prepare('UPDATE undo_groups SET undone = 1 WHERE id = ?').run(group.id);
    })();
    return { undone: group.label, ...this.status() };
  }

  redo() {
    const group = this.database
      .prepare('SELECT id, label FROM undo_groups WHERE undone = 1 ORDER BY id ASC LIMIT 1')
      .get();
    if (!group) return { redone: null, ...this.status() };
    this.database.transaction(() => {
      this.replay(group.id, 'redo');
      this.database.prepare('UPDATE undo_groups SET undone = 0 WHERE id = ?').run(group.id);
    })();
    return { redone: group.label, ...this.status() };
  }
}
