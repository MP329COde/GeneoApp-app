import { withTransaction, recordAudit } from './base-repository.js';

export class ParentageRepository {
  constructor(database) {
    this.database = database;
  }

  create(
    {
      childId,
      parentId,
      parentRole = 'PARENT',
      linkType = 'BIOLOGICAL',
      unionId = null,
      notes = null,
    },
    { performedBy = null } = {},
  ) {
    if (!childId || !parentId) {
      throw new Error('childId et parentId sont obligatoires');
    }
    if (childId === parentId) {
      throw new Error('Une personne ne peut pas être son propre parent');
    }

    return withTransaction(this.database, () => {
      const info = this.database
        .prepare(
          `INSERT INTO parentages (child_id, parent_id, parent_role, link_type, union_id, notes)
           VALUES (@childId, @parentId, @parentRole, @linkType, @unionId, @notes)`,
        )
        .run({ childId, parentId, parentRole, linkType, unionId, notes });

      const id = info.lastInsertRowid;
      recordAudit(this.database, {
        tableName: 'parentages',
        rowId: id,
        operation: 'INSERT',
        changes: { childId, parentId, parentRole, linkType, unionId, notes },
        performedBy,
      });

      return this.findById(id);
    });
  }

  findById(id, { includeDeleted = false } = {}) {
    const clause = includeDeleted ? '' : 'AND deleted_at IS NULL';
    return this.database.prepare(`SELECT * FROM parentages WHERE id = ? ${clause}`).get(id) ?? null;
  }

  findParentsOf(childId, { includeDeleted = false } = {}) {
    const clause = includeDeleted ? '' : 'AND deleted_at IS NULL';
    return this.database
      .prepare(`SELECT * FROM parentages WHERE child_id = ? ${clause}`)
      .all(childId);
  }

  findChildrenOf(parentId, { includeDeleted = false } = {}) {
    const clause = includeDeleted ? '' : 'AND deleted_at IS NULL';
    return this.database
      .prepare(`SELECT * FROM parentages WHERE parent_id = ? ${clause}`)
      .all(parentId);
  }

  softDelete(id, { performedBy = null } = {}) {
    return withTransaction(this.database, () => {
      const existing = this.findById(id);
      if (!existing) {
        throw new Error(`Filiation introuvable : ${id}`);
      }

      this.database
        .prepare(
          `UPDATE parentages SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                                 updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ? AND deleted_at IS NULL`,
        )
        .run(id);

      recordAudit(this.database, {
        tableName: 'parentages',
        rowId: id,
        operation: 'DELETE',
        performedBy,
      });

      return true;
    });
  }

  restore(id, { performedBy = null } = {}) {
    return withTransaction(this.database, () => {
      const existing = this.findById(id, { includeDeleted: true });
      if (!existing || existing.deleted_at === null) {
        throw new Error(`Filiation non supprimée ou introuvable : ${id}`);
      }

      this.database
        .prepare(
          `UPDATE parentages SET deleted_at = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ?`,
        )
        .run(id);

      recordAudit(this.database, {
        tableName: 'parentages',
        rowId: id,
        operation: 'RESTORE',
        performedBy,
      });

      return this.findById(id);
    });
  }
}
