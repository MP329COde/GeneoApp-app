import { withTransaction, recordAudit } from './base-repository.js';

export class UnionRepository {
  constructor(database) {
    this.database = database;
  }

  /**
   * Crée une union et ses partenaires. partnerIds: personId[] (2 ou plus).
   */
  create(
    { type = 'OTHER', startEventId = null, endEventId = null, notes = null, partnerIds = [] },
    { performedBy = null } = {},
  ) {
    if (partnerIds.length < 2) {
      throw new Error('Une union nécessite au moins deux partenaires');
    }

    return withTransaction(this.database, () => {
      const info = this.database
        .prepare(
          `INSERT INTO unions (type, start_event_id, end_event_id, notes)
           VALUES (@type, @startEventId, @endEventId, @notes)`,
        )
        .run({ type, startEventId, endEventId, notes });

      const unionId = info.lastInsertRowid;
      recordAudit(this.database, {
        tableName: 'unions',
        rowId: unionId,
        operation: 'INSERT',
        changes: { type, startEventId, endEventId, notes, partnerIds },
        performedBy,
      });

      for (const personId of partnerIds) {
        const partnerInfo = this.database
          .prepare(`INSERT INTO union_partners (union_id, person_id) VALUES (?, ?)`)
          .run(unionId, personId);

        recordAudit(this.database, {
          tableName: 'union_partners',
          rowId: partnerInfo.lastInsertRowid,
          operation: 'INSERT',
          changes: { unionId, personId },
          performedBy,
        });
      }

      return this.findById(unionId);
    });
  }

  findById(id, { includeDeleted = false } = {}) {
    const clause = includeDeleted ? '' : 'AND deleted_at IS NULL';
    const union = this.database.prepare(`SELECT * FROM unions WHERE id = ? ${clause}`).get(id);
    if (!union) return null;

    union.partnerIds = this.database
      .prepare(`SELECT person_id FROM union_partners WHERE union_id = ? AND deleted_at IS NULL`)
      .all(id)
      .map((row) => row.person_id);

    return union;
  }

  list({ includeDeleted = false } = {}) {
    const clause = includeDeleted ? '' : 'WHERE deleted_at IS NULL';
    return this.database
      .prepare(`SELECT id FROM unions ${clause} ORDER BY id`)
      .all()
      .map((row) => this.findById(row.id, { includeDeleted }));
  }

  update(id, patch, { performedBy = null } = {}) {
    const columns = {
      type: 'type',
      startEventId: 'start_event_id',
      endEventId: 'end_event_id',
      notes: 'notes',
    };
    const fields = Object.keys(patch).filter((key) => key in columns);
    if (fields.length === 0) throw new Error('Aucun champ modifiable fourni');
    return withTransaction(this.database, () => {
      if (!this.findById(id)) throw new Error(`Union introuvable : ${id}`);
      this.database
        .prepare(
          `UPDATE unions SET ${fields.map((f) => `${columns[f]} = @${f}`).join(', ')},
                             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = @id AND deleted_at IS NULL`,
        )
        .run({ id, ...Object.fromEntries(fields.map((f) => [f, patch[f]])) });
      recordAudit(this.database, {
        tableName: 'unions',
        rowId: id,
        operation: 'UPDATE',
        changes: Object.fromEntries(fields.map((f) => [f, patch[f]])),
        performedBy,
      });
      return this.findById(id);
    });
  }

  addPartner(unionId, personId, { performedBy = null } = {}) {
    return withTransaction(this.database, () => {
      const info = this.database
        .prepare('INSERT INTO union_partners (union_id, person_id) VALUES (?, ?)')
        .run(unionId, personId);
      recordAudit(this.database, {
        tableName: 'union_partners',
        rowId: info.lastInsertRowid,
        operation: 'INSERT',
        changes: { unionId, personId },
        performedBy,
      });
      return this.findById(unionId);
    });
  }

  removePartner(unionId, personId, { performedBy = null } = {}) {
    return withTransaction(this.database, () => {
      const row = this.database
        .prepare(
          'SELECT id FROM union_partners WHERE union_id = ? AND person_id = ? AND deleted_at IS NULL',
        )
        .get(unionId, personId);
      if (!row) return null;
      this.database
        .prepare(
          `UPDATE union_partners SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                                     updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ?`,
        )
        .run(row.id);
      recordAudit(this.database, {
        tableName: 'union_partners',
        rowId: row.id,
        operation: 'DELETE',
        performedBy,
      });
      return this.findById(unionId);
    });
  }

  findForPerson(personId, { includeDeleted = false } = {}) {
    const clause = includeDeleted ? '' : 'AND u.deleted_at IS NULL';
    return this.database
      .prepare(
        `SELECT DISTINCT u.*
         FROM unions u
         JOIN union_partners up ON up.union_id = u.id
         WHERE up.person_id = ? AND up.deleted_at IS NULL ${clause}`,
      )
      .all(personId)
      .map((union) => this.findById(union.id, { includeDeleted }));
  }

  softDelete(id, { performedBy = null } = {}) {
    return withTransaction(this.database, () => {
      const existing = this.findById(id);
      if (!existing) {
        throw new Error(`Union introuvable : ${id}`);
      }

      this.database
        .prepare(
          `UPDATE unions SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ? AND deleted_at IS NULL`,
        )
        .run(id);

      recordAudit(this.database, {
        tableName: 'unions',
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
        throw new Error(`Union non supprimée ou introuvable : ${id}`);
      }

      this.database
        .prepare(
          `UPDATE unions SET deleted_at = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ?`,
        )
        .run(id);

      recordAudit(this.database, {
        tableName: 'unions',
        rowId: id,
        operation: 'RESTORE',
        performedBy,
      });

      return this.findById(id);
    });
  }
}
