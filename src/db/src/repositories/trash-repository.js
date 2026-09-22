import { withTransaction, recordAudit } from './base-repository.js';

// Tables métier prises en charge par la corbeille (suppression douce via
// `deleted_at`). `sources`/`citations` n'ont pas encore de suppression douce
// et sont donc hors périmètre.
const TRASH_TABLES = {
  persons: (row) => `${row.given_names} ${row.family_name}`.trim(),
  places: (row) => row.name,
  events: (row) => row.type,
  unions: (row) => row.type,
  parentages: (row) => `parent #${row.parent_id} -> enfant #${row.child_id}`,
  media: (row) => row.original_filename,
};

export const TRASH_TABLE_NAMES = Object.keys(TRASH_TABLES);

export class TrashRepository {
  constructor(database) {
    this.database = database;
  }

  list() {
    const entries = [];
    for (const table of TRASH_TABLE_NAMES) {
      const rows = this.database
        .prepare(`SELECT * FROM ${table} WHERE deleted_at IS NOT NULL`)
        .all();
      for (const row of rows) {
        entries.push({
          table,
          id: row.id,
          label: TRASH_TABLES[table](row),
          deletedAt: row.deleted_at,
        });
      }
    }
    entries.sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''));
    return entries;
  }

  purge(table, id, { performedBy = null } = {}) {
    if (!TRASH_TABLE_NAMES.includes(table)) {
      throw new Error(`Table de corbeille invalide : ${table}`);
    }

    return withTransaction(this.database, () => {
      const row = this.database
        .prepare(`SELECT id FROM ${table} WHERE id = ? AND deleted_at IS NOT NULL`)
        .get(id);
      if (!row) {
        throw new Error(`Élément introuvable dans la corbeille : ${table}#${id}`);
      }

      this.database.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);

      recordAudit(this.database, {
        tableName: table,
        rowId: id,
        operation: 'DELETE',
        changes: { purged: true },
        performedBy,
      });

      return true;
    });
  }
}
