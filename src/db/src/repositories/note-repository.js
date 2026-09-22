import { withTransaction, recordAudit } from './base-repository.js';

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
}
