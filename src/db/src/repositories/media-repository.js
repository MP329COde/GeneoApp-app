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
      externalUrl = null,
    },
    { performedBy = null } = {},
  ) {
    return withTransaction(this.database, () => {
      const info = this.database
        .prepare(
          `INSERT INTO media
             (source_id, entity_type, entity_id, original_filename, stored_filename,
              mime_type, size_bytes, checksum_sha256, notes, external_url)
           VALUES
             (@sourceId, @entityType, @entityId, @originalFilename, @storedFilename,
              @mimeType, @sizeBytes, @checksumSha256, @notes, @externalUrl)`,
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
          externalUrl,
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

  // Médias d'une entité : cible principale du média OU l'un de ses liens
  // supplémentaires (un média peut documenter plusieurs fiches à la fois).
  findForEntity(entityType, entityId, { includeDeleted = false } = {}) {
    const clause = includeDeleted ? '' : 'AND m.deleted_at IS NULL';
    return this.database
      .prepare(
        `SELECT m.* FROM media m
         WHERE ((m.entity_type = @entityType AND m.entity_id = @entityId)
            OR m.id IN (
              SELECT media_id FROM media_links
              WHERE entity_type = @entityType AND entity_id = @entityId AND deleted_at IS NULL
            )) ${clause}
         ORDER BY m.created_at, m.id`,
      )
      .all({ entityType, entityId });
  }

  listLinks(mediaId) {
    return this.database
      .prepare(
        `SELECT id, media_id AS mediaId, entity_type AS entityType, entity_id AS entityId, role
         FROM media_links WHERE media_id = ? AND deleted_at IS NULL ORDER BY id`,
      )
      .all(mediaId);
  }

  /** Ajoute un lien ; le même lien (média, cible, rôle) n'est jamais créé deux fois. */
  addLink(mediaId, { entityType, entityId, role = 'SUBJECT' }, { performedBy = null } = {}) {
    return withTransaction(this.database, () => {
      const existing = this.database
        .prepare(
          `SELECT id FROM media_links
           WHERE media_id = ? AND entity_type = ? AND entity_id = ? AND role = ? AND deleted_at IS NULL`,
        )
        .get(mediaId, entityType, entityId, role);
      if (existing) return this.listLinks(mediaId).find((link) => link.id === existing.id);
      const info = this.database
        .prepare(
          'INSERT INTO media_links (media_id, entity_type, entity_id, role) VALUES (?, ?, ?, ?)',
        )
        .run(mediaId, entityType, entityId, role);
      recordAudit(this.database, {
        tableName: 'media_links',
        rowId: info.lastInsertRowid,
        operation: 'INSERT',
        changes: { mediaId, entityType, entityId, role },
        performedBy,
      });
      return this.listLinks(mediaId).find((link) => link.id === info.lastInsertRowid);
    });
  }

  removeLink(mediaId, linkId, { performedBy = null } = {}) {
    return withTransaction(this.database, () => {
      const result = this.database
        .prepare(
          `UPDATE media_links SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                                  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ? AND media_id = ? AND deleted_at IS NULL`,
        )
        .run(linkId, mediaId);
      if (result.changes === 0) return false;
      recordAudit(this.database, {
        tableName: 'media_links',
        rowId: linkId,
        operation: 'DELETE',
        performedBy,
      });
      return true;
    });
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

      // Le média having été retiré de l'index à sa suppression, il doit y
      // revenir : sinon il resterait introuvable après restauration.
      indexDocument(this.database, {
        entityType: 'MEDIA',
        entityId: id,
        title: existing.original_filename,
        body: existing.ocr_text ?? '',
      });

      return this.findById(id);
    });
  }
}
