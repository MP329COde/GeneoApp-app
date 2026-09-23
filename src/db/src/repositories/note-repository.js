import { withTransaction, recordAudit, NOW_EXPRESSION } from './base-repository.js';

export class NoteRepository {
  constructor(database) {
    this.database = database;
  }

  create(
    { entityType, entityId, title = null, body, confidence = 'MEDIUM', isContradiction = false },
    { performedBy = null } = {},
  ) {
    return withTransaction(this.database, () => {
      const result = this.database
        .prepare(
          `INSERT INTO notes (entity_type, entity_id, title, body, confidence, is_contradiction)
           VALUES (@entityType, @entityId, @title, @body, @confidence, @isContradiction)`,
        )
        .run({
          entityType,
          entityId,
          title,
          body,
          confidence,
          isContradiction: isContradiction ? 1 : 0,
        });
      recordAudit(this.database, {
        tableName: 'notes',
        rowId: result.lastInsertRowid,
        operation: 'INSERT',
        changes: { entityType, entityId, title, confidence, isContradiction },
        performedBy,
      });
      return this.findById(result.lastInsertRowid);
    });
  }

  findById(id) {
    return (
      this.database.prepare('SELECT * FROM notes WHERE id = ? AND deleted_at IS NULL').get(id) ??
      null
    );
  }

  listForEntity(entityType, entityId) {
    return this.database
      .prepare(
        'SELECT * FROM notes WHERE entity_type = ? AND entity_id = ? AND deleted_at IS NULL ORDER BY id',
      )
      .all(entityType, entityId);
  }

  /** Toutes les notes, filtrées par cible et par texte (titre ou contenu). */
  listAll({ entityType = null, query = null, contradictionsOnly = false, limit = 500 } = {}) {
    const clauses = ['deleted_at IS NULL'];
    const params = {};
    if (entityType) {
      clauses.push('entity_type = @entityType');
      params.entityType = entityType;
    }
    if (query) {
      clauses.push("(title LIKE @query ESCAPE '\\' OR body LIKE @query ESCAPE '\\')");
      params.query = `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    }
    if (contradictionsOnly) clauses.push('is_contradiction = 1');
    return this.database
      .prepare(
        `SELECT * FROM notes WHERE ${clauses.join(' AND ')} ORDER BY updated_at DESC, id DESC LIMIT @limit`,
      )
      .all({ ...params, limit });
  }

  update(id, patch, { performedBy = null } = {}) {
    const fields = {
      title: 'title',
      body: 'body',
      confidence: 'confidence',
      isContradiction: 'is_contradiction',
    };
    return withTransaction(this.database, () => {
      const entries = Object.entries(fields).filter(([key]) => patch[key] !== undefined);
      if (entries.length > 0) {
        const values = Object.fromEntries(
          entries.map(([key]) => [
            key,
            key === 'isContradiction' ? (patch[key] ? 1 : 0) : patch[key],
          ]),
        );
        this.database
          .prepare(
            `UPDATE notes SET ${entries.map(([key, column]) => `${column} = @${key}`).join(', ')},
               updated_at = ${NOW_EXPRESSION} WHERE id = @id AND deleted_at IS NULL`,
          )
          .run({ ...values, id });
        recordAudit(this.database, {
          tableName: 'notes',
          rowId: id,
          operation: 'UPDATE',
          changes: values,
          performedBy,
        });
      }
      return this.findById(id);
    });
  }

  softDelete(id, { performedBy = null } = {}) {
    return withTransaction(this.database, () => {
      const result = this.database
        .prepare(
          `UPDATE notes SET deleted_at = ${NOW_EXPRESSION} WHERE id = ? AND deleted_at IS NULL`,
        )
        .run(id);
      if (result.changes === 0) return false;
      recordAudit(this.database, {
        tableName: 'notes',
        rowId: id,
        operation: 'DELETE',
        performedBy,
      });
      return true;
    });
  }
}
