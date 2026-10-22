import { withTransaction, recordAudit } from './base-repository.js';
import { indexDocument } from './search-index.js';

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
}
