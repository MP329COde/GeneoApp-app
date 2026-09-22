import { withTransaction, recordAudit } from './base-repository.js';
import { indexDocument } from './search-index.js';

export class SourceRepository {
  constructor(database) {
    this.database = database;
  }

  create({ title, author = null, publicationInfo = null }, { performedBy = null } = {}) {
    if (!title) {
      throw new Error('title est obligatoire');
    }

    return withTransaction(this.database, () => {
      const info = this.database
        .prepare(
          `INSERT INTO sources (title, author, publication_info)
           VALUES (@title, @author, @publicationInfo)`,
        )
        .run({ title, author, publicationInfo });

      const id = info.lastInsertRowid;
      recordAudit(this.database, {
        tableName: 'sources',
        rowId: id,
        operation: 'INSERT',
        changes: { title, author, publicationInfo },
        performedBy,
      });

      indexDocument(this.database, {
        entityType: 'SOURCE',
        entityId: id,
        title,
        body: [author, publicationInfo].filter(Boolean).join(' — '),
      });

      return this.findById(id);
    });
  }

  addCitation(
    { sourceId, entityType, entityId, page = null, confidence = 'MEDIUM', notes = null },
    { performedBy = null } = {},
  ) {
    return withTransaction(this.database, () => {
      const info = this.database
        .prepare(
          `INSERT INTO citations (source_id, entity_type, entity_id, page, confidence, notes)
           VALUES (@sourceId, @entityType, @entityId, @page, @confidence, @notes)`,
        )
        .run({ sourceId, entityType, entityId, page, confidence, notes });

      const id = info.lastInsertRowid;
      recordAudit(this.database, {
        tableName: 'citations',
        rowId: id,
        operation: 'INSERT',
        changes: { sourceId, entityType, entityId, page, confidence, notes },
        performedBy,
      });

      return id;
    });
  }

  findById(id, { includeDeleted = false } = {}) {
    const clause = includeDeleted ? '' : 'AND deleted_at IS NULL';
    return this.database.prepare(`SELECT * FROM sources WHERE id = ? ${clause}`).get(id) ?? null;
  }

  findCitationsForEntity(entityType, entityId, { includeDeleted = false } = {}) {
    const clause = includeDeleted ? '' : 'AND deleted_at IS NULL';
    return this.database
      .prepare(`SELECT * FROM citations WHERE entity_type = ? AND entity_id = ? ${clause}`)
      .all(entityType, entityId);
  }
}
