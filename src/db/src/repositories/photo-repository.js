import { withTransaction, recordAudit, NOW_EXPRESSION } from './base-repository.js';

const METADATA_FIELDS = {
  takenDate: 'taken_date',
  placeId: 'place_id',
  description: 'description',
  tags: 'tags',
};

// Métadonnées de photo et zones « personne présente » sur un média.
export class PhotoRepository {
  constructor(database) {
    this.database = database;
  }

  findMedia(id) {
    return (
      this.database.prepare('SELECT * FROM media WHERE id = ? AND deleted_at IS NULL').get(id) ??
      null
    );
  }

  updateMetadata(mediaId, patch, { performedBy = null } = {}) {
    return withTransaction(this.database, () => {
      const entries = Object.entries(METADATA_FIELDS).filter(([key]) => patch[key] !== undefined);
      if (entries.length > 0) {
        this.database
          .prepare(
            `UPDATE media SET ${entries.map(([key, column]) => `${column} = @${key}`).join(', ')},
               updated_at = ${NOW_EXPRESSION} WHERE id = @id AND deleted_at IS NULL`,
          )
          .run({ ...Object.fromEntries(entries.map(([key]) => [key, patch[key]])), id: mediaId });
        recordAudit(this.database, {
          tableName: 'media',
          rowId: mediaId,
          operation: 'UPDATE',
          changes: Object.fromEntries(entries.map(([key]) => [key, patch[key]])),
          performedBy,
        });
      }
      return this.findMedia(mediaId);
    });
  }

  listRegions(mediaId) {
    return this.database
      .prepare(
        `SELECT r.*, p.given_names, p.family_name
         FROM media_regions r LEFT JOIN persons p ON p.id = r.person_id
         WHERE r.media_id = ? AND r.deleted_at IS NULL ORDER BY r.x, r.id`,
      )
      .all(mediaId);
  }

  /** Photos où une personne a été identifiée. */
  listForPerson(personId) {
    return this.database
      .prepare(
        `SELECT DISTINCT m.* FROM media m
         JOIN media_regions r ON r.media_id = m.id AND r.deleted_at IS NULL
         WHERE r.person_id = ? AND m.deleted_at IS NULL ORDER BY m.id`,
      )
      .all(personId);
  }

  addRegion(
    mediaId,
    { personId = null, label = null, x, y, width, height },
    { performedBy = null } = {},
  ) {
    return withTransaction(this.database, () => {
      const inserted = this.database
        .prepare(
          `INSERT INTO media_regions (media_id, person_id, label, x, y, width, height)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(mediaId, personId, label, x, y, width, height);
      recordAudit(this.database, {
        tableName: 'media_regions',
        rowId: inserted.lastInsertRowid,
        operation: 'INSERT',
        changes: { mediaId, personId, label },
        performedBy,
      });
      return this.listRegions(mediaId).find((region) => region.id === inserted.lastInsertRowid);
    });
  }

  findRegion(id) {
    return (
      this.database
        .prepare('SELECT * FROM media_regions WHERE id = ? AND deleted_at IS NULL')
        .get(id) ?? null
    );
  }

  removeRegion(id, { performedBy = null } = {}) {
    return withTransaction(this.database, () => {
      const result = this.database
        .prepare(
          `UPDATE media_regions SET deleted_at = ${NOW_EXPRESSION} WHERE id = ? AND deleted_at IS NULL`,
        )
        .run(id);
      if (result.changes === 0) return false;
      recordAudit(this.database, {
        tableName: 'media_regions',
        rowId: id,
        operation: 'DELETE',
        performedBy,
      });
      return true;
    });
  }
}
