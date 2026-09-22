import { withTransaction, recordAudit } from './base-repository.js';
import { indexDocument, removeFromIndex } from './search-index.js';

export class MediaRepository {
  constructor(database) {
    this.database = database;
  }

  create(
    {
      sourceId = null,
      entityType = null,
      entityId = null,
      originalFilename,
      storedFilename,
      mimeType,
      sizeBytes,
      checksumSha256,
      notes = null,
    },
    { performedBy = null } = {},
  ) {
    return withTransaction(this.database, () => {
      const info = this.database
        .prepare(
          `INSERT INTO media
             (source_id, entity_type, entity_id, original_filename, stored_filename,
              mime_type, size_bytes, checksum_sha256, notes)
           VALUES
             (@sourceId, @entityType, @entityId, @originalFilename, @storedFilename,
              @mimeType, @sizeBytes, @checksumSha256, @notes)`,
        )
        .run({
          sourceId,
          entityType,
          entityId,
          originalFilename,
          storedFilename,
          mimeType,
          sizeBytes,
          checksumSha256,
          notes,
        });

      const id = info.lastInsertRowid;
      recordAudit(this.database, {
        tableName: 'media',
        rowId: id,
        operation: 'INSERT',
        changes: { sourceId, entityType, entityId, originalFilename, mimeType, sizeBytes },
        performedBy,
      });

      indexDocument(this.database, {
        entityType: 'MEDIA',
        entityId: id,
        title: originalFilename,
        body: '',
      });

      return this.findById(id);
    });
  }

  findById(id, { includeDeleted = false } = {}) {
    const clause = includeDeleted ? '' : 'AND deleted_at IS NULL';
    return this.database.prepare(`SELECT * FROM media WHERE id = ? ${clause}`).get(id) ?? null;
  }

  findBySource(sourceId, { includeDeleted = false } = {}) {
    const clause = includeDeleted ? '' : 'AND deleted_at IS NULL';
    return this.database
      .prepare(`SELECT * FROM media WHERE source_id = ? ${clause} ORDER BY created_at`)
      .all(sourceId);
  }

  findForEntity(entityType, entityId, { includeDeleted = false } = {}) {
    const clause = includeDeleted ? '' : 'AND deleted_at IS NULL';
    return this.database
      .prepare(
        `SELECT * FROM media WHERE entity_type = ? AND entity_id = ? ${clause} ORDER BY created_at`,
      )
      .all(entityType, entityId);
  }

  /**
   * Enregistre le résultat d'une passe OCR. Le texte d'une passe précédente
   * n'est jamais perdu en cours de route : le dépôt écrit toujours le
   * dernier résultat connu et laisse la piste d'audit (audit_log) porter la
   * trace des versions successives, de sorte qu'une contradiction entre deux
   * lectures reste consultable après coup plutôt qu'être silencieusement
   * écrasée.
   */
  recordOcrResult(id, { status, text = null }, { performedBy = null } = {}) {
    return withTransaction(this.database, () => {
      const existing = this.findById(id);
      if (!existing) {
        throw new Error(`Média introuvable : ${id}`);
      }

      this.database
        .prepare(
          `UPDATE media SET ocr_status = @status, ocr_text = @text,
                            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = @id AND deleted_at IS NULL`,
        )
        .run({ id, status, text });

      recordAudit(this.database, {
        tableName: 'media',
        rowId: id,
        operation: 'UPDATE',
        changes: { ocrStatus: status, ocrTextLength: text ? text.length : 0 },
        performedBy,
      });

      indexDocument(this.database, {
        entityType: 'MEDIA',
        entityId: id,
        title: existing.original_filename,
        body: text ?? '',
      });

      return this.findById(id);
    });
  }

  softDelete(id, { performedBy = null } = {}) {
    return withTransaction(this.database, () => {
      const existing = this.findById(id);
      if (!existing) {
        throw new Error(`Média introuvable : ${id}`);
      }

      this.database
        .prepare(
          `UPDATE media SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ? AND deleted_at IS NULL`,
        )
        .run(id);

      recordAudit(this.database, {
        tableName: 'media',
        rowId: id,
        operation: 'DELETE',
        performedBy,
      });

      removeFromIndex(this.database, { entityType: 'MEDIA', entityId: id });

      return true;
    });
  }

  restore(id, { performedBy = null } = {}) {
    return withTransaction(this.database, () => {
      const existing = this.findById(id, { includeDeleted: true });
      if (!existing || existing.deleted_at === null) {
        throw new Error(`Média non supprimé ou introuvable : ${id}`);
      }

      this.database
        .prepare(
          `UPDATE media SET deleted_at = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ?`,
        )
        .run(id);

      recordAudit(this.database, {
        tableName: 'media',
        rowId: id,
        operation: 'RESTORE',
        performedBy,
      });

      return this.findById(id);
    });
  }
}
