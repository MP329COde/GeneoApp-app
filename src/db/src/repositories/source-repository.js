import { withTransaction, recordAudit } from './base-repository.js';
import { indexDocument, removeFromIndex } from './search-index.js';

export class SourceRepository {
  constructor(database) {
    this.database = database;
  }

  create(
    { title, author = null, publicationInfo = null, sourceKind = 'UNKNOWN' },
    { performedBy = null } = {},
  ) {
    if (!title) {
      throw new Error('title est obligatoire');
    }

    return withTransaction(this.database, () => {
      const info = this.database
        .prepare(
          `INSERT INTO sources (title, author, publication_info, source_kind)
           VALUES (@title, @author, @publicationInfo, @sourceKind)`,
        )
        .run({ title, author, publicationInfo, sourceKind });

      const id = info.lastInsertRowid;
      recordAudit(this.database, {
        tableName: 'sources',
        rowId: id,
        operation: 'INSERT',
        changes: { title, author, publicationInfo, sourceKind },
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
    {
      sourceId,
      entityType,
      entityId,
      page = null,
      confidence = 'MEDIUM',
      notes = null,
      evidenceType = 'UNKNOWN',
      informationQuality = 'UNKNOWN',
      quotation = null,
    },
    { performedBy = null } = {},
  ) {
    return withTransaction(this.database, () => {
      if (!this.citationTargetExists(entityType, entityId)) {
        throw new Error(`Entité introuvable : ${entityType}#${entityId}`);
      }
      const info = this.database
        .prepare(
          `INSERT INTO citations (
             source_id, entity_type, entity_id, page, confidence, notes,
             evidence_type, information_quality, quotation
           )
           VALUES (
             @sourceId, @entityType, @entityId, @page, @confidence, @notes,
             @evidenceType, @informationQuality, @quotation
           )`,
        )
        .run({
          sourceId,
          entityType,
          entityId,
          page,
          confidence,
          notes,
          evidenceType,
          informationQuality,
          quotation,
        });

      const id = info.lastInsertRowid;
      recordAudit(this.database, {
        tableName: 'citations',
        rowId: id,
        operation: 'INSERT',
        changes: {
          sourceId,
          entityType,
          entityId,
          page,
          confidence,
          notes,
          evidenceType,
          informationQuality,
          quotation,
        },
        performedBy,
      });

      return id;
    });
  }

  /**
   * Une citation vise une entité par référence polymorphe, sans clé étrangère :
   * l'existence de la cible est vérifiée ici pour ne jamais citer une
   * affirmation ou un lieu fantôme. Les autres types ne sont pas contrôlés
   * (comportement historique).
   */
  citationTargetExists(entityType, entityId) {
    const table = { ASSERTION: 'assertions', PLACE: 'places' }[entityType];
    if (!table) return true;
    return Boolean(
      this.database
        .prepare(`SELECT 1 FROM ${table} WHERE id = ? AND deleted_at IS NULL`)
        .get(entityId),
    );
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

  list({ includeDeleted = false } = {}) {
    const clause = includeDeleted ? '' : 'WHERE deleted_at IS NULL';
    return this.database.prepare(`SELECT * FROM sources ${clause} ORDER BY title, id`).all();
  }

  update(id, patch, { performedBy = null } = {}) {
    const columns = {
      title: 'title',
      author: 'author',
      publicationInfo: 'publication_info',
      sourceKind: 'source_kind',
    };
    const fields = Object.keys(patch).filter((key) => key in columns);
    if (fields.length === 0) throw new Error('Aucun champ modifiable fourni');
    return withTransaction(this.database, () => {
      if (!this.findById(id)) throw new Error(`Source introuvable : ${id}`);
      this.database
        .prepare(
          `UPDATE sources SET ${fields.map((f) => `${columns[f]} = @${f}`).join(', ')},
                              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = @id AND deleted_at IS NULL`,
        )
        .run({ id, ...Object.fromEntries(fields.map((f) => [f, patch[f]])) });
      recordAudit(this.database, {
        tableName: 'sources',
        rowId: id,
        operation: 'UPDATE',
        changes: Object.fromEntries(fields.map((f) => [f, patch[f]])),
        performedBy,
      });
      const updated = this.findById(id);
      indexDocument(this.database, {
        entityType: 'SOURCE',
        entityId: id,
        title: updated.title,
        body: [updated.author, updated.publication_info].filter(Boolean).join(' — '),
      });
      return updated;
    });
  }

  /** Éléments qui s'appuient sur une source : sa suppression les laisserait sans référence. */
  usageOf(id) {
    const count = (sql) => this.database.prepare(sql).get(id).n;
    return {
      citations: count(
        'SELECT COUNT(*) AS n FROM citations WHERE source_id = ? AND deleted_at IS NULL',
      ),
      media: count('SELECT COUNT(*) AS n FROM media WHERE source_id = ? AND deleted_at IS NULL'),
      evidence: count(
        'SELECT COUNT(*) AS n FROM research_evidence WHERE source_id = ? AND deleted_at IS NULL',
      ),
    };
  }

  softDelete(id, { performedBy = null } = {}) {
    return withTransaction(this.database, () => {
      const result = this.database
        .prepare(
          `UPDATE sources SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ? AND deleted_at IS NULL`,
        )
        .run(id);
      if (result.changes === 0) return false;
      recordAudit(this.database, {
        tableName: 'sources',
        rowId: id,
        operation: 'DELETE',
        performedBy,
      });
      removeFromIndex(this.database, { entityType: 'SOURCE', entityId: id });
      return true;
    });
  }

  restore(id, { performedBy = null } = {}) {
    return withTransaction(this.database, () => {
      const existing = this.findById(id, { includeDeleted: true });
      if (!existing || existing.deleted_at === null) {
        throw new Error(`Source non supprimée ou introuvable : ${id}`);
      }
      this.database
        .prepare(
          `UPDATE sources SET deleted_at = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ?`,
        )
        .run(id);
      recordAudit(this.database, {
        tableName: 'sources',
        rowId: id,
        operation: 'RESTORE',
        performedBy,
      });
      indexDocument(this.database, {
        entityType: 'SOURCE',
        entityId: id,
        title: existing.title,
        body: [existing.author, existing.publication_info].filter(Boolean).join(' — '),
      });
      return this.findById(id);
    });
  }

  findCitationById(id, { includeDeleted = false } = {}) {
    const clause = includeDeleted ? '' : 'AND deleted_at IS NULL';
    return this.database.prepare(`SELECT * FROM citations WHERE id = ? ${clause}`).get(id) ?? null;
  }

  updateCitation(id, patch, { performedBy = null } = {}) {
    const columns = {
      page: 'page',
      confidence: 'confidence',
      notes: 'notes',
      evidenceType: 'evidence_type',
      informationQuality: 'information_quality',
      quotation: 'quotation',
    };
    const fields = Object.keys(patch).filter((key) => key in columns);
    if (fields.length === 0) throw new Error('Aucun champ modifiable fourni');
    return withTransaction(this.database, () => {
      if (!this.findCitationById(id)) throw new Error(`Citation introuvable : ${id}`);
      this.database
        .prepare(
          `UPDATE citations SET ${fields.map((f) => `${columns[f]} = @${f}`).join(', ')},
                                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = @id AND deleted_at IS NULL`,
        )
        .run({ id, ...Object.fromEntries(fields.map((f) => [f, patch[f]])) });
      recordAudit(this.database, {
        tableName: 'citations',
        rowId: id,
        operation: 'UPDATE',
        changes: Object.fromEntries(fields.map((f) => [f, patch[f]])),
        performedBy,
      });
      return this.findCitationById(id);
    });
  }

  softDeleteCitation(id, { performedBy = null } = {}) {
    return withTransaction(this.database, () => {
      const result = this.database
        .prepare(
          `UPDATE citations SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ? AND deleted_at IS NULL`,
        )
        .run(id);
      if (result.changes === 0) return false;
      recordAudit(this.database, {
        tableName: 'citations',
        rowId: id,
        operation: 'DELETE',
        performedBy,
      });
      return true;
    });
  }

  restoreCitation(id, { performedBy = null } = {}) {
    return withTransaction(this.database, () => {
      const existing = this.findCitationById(id, { includeDeleted: true });
      if (!existing || existing.deleted_at === null) {
        throw new Error(`Citation non supprimée ou introuvable : ${id}`);
      }
      this.database
        .prepare(
          `UPDATE citations SET deleted_at = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ?`,
        )
        .run(id);
      recordAudit(this.database, {
        tableName: 'citations',
        rowId: id,
        operation: 'RESTORE',
        performedBy,
      });
      return this.findCitationById(id);
    });
  }
}
