// Accès SQLite de l'index de documents (sources, documents, FTS, réglages, journal).
export class IndexRepository {
  constructor(database) {
    this.database = database;
  }

  listSources() {
    return this.database
      .prepare(
        `SELECT s.*, (SELECT COUNT(*) FROM indexed_documents d WHERE d.source_id = s.id) AS document_count
         FROM index_sources s WHERE s.deleted_at IS NULL ORDER BY s.id`,
      )
      .all();
  }

  findSource(id) {
    return (
      this.database
        .prepare('SELECT * FROM index_sources WHERE id = ? AND deleted_at IS NULL')
        .get(id) ?? null
    );
  }

  createSource({ kind, label, location, maxDepth, maxDocuments }) {
    const result = this.database
      .prepare(
        `INSERT INTO index_sources (kind, label, location, max_depth, max_documents)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(kind, label, location, maxDepth, maxDocuments);
    return this.findSource(result.lastInsertRowid);
  }

  updateSource(id, { enabled }) {
    this.database
      .prepare('UPDATE index_sources SET enabled = ? WHERE id = ?')
      .run(enabled ? 1 : 0, id);
    return this.findSource(id);
  }

  removeSource(id) {
    return this.database.transaction(() => {
      for (const { id: documentId } of this.database
        .prepare('SELECT id FROM indexed_documents WHERE source_id = ?')
        .all(id)) {
        this.database.prepare('DELETE FROM documents_fts WHERE rowid = ?').run(documentId);
      }
      this.database.prepare('DELETE FROM indexed_documents WHERE source_id = ?').run(id);
      return (
        this.database
          .prepare(
            "UPDATE index_sources SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND deleted_at IS NULL",
          )
          .run(id).changes > 0
      );
    })();
  }

  findDocument(sourceId, location) {
    return (
      this.database
        .prepare('SELECT * FROM indexed_documents WHERE source_id = ? AND location = ?')
        .get(sourceId, location) ?? null
    );
  }

  /** Crée ou remplace un document et son entrée plein texte (transaction). */
  upsertDocument({
    sourceId,
    location,
    title,
    mimeType,
    sizeBytes,
    checksum,
    status,
    text,
    mediaId,
  }) {
    return this.database.transaction(() => {
      const existing = this.findDocument(sourceId, location);
      const excerpt = text ? text.replace(/\s+/g, ' ').slice(0, 400) : null;
      let id;
      if (existing) {
        id = existing.id;
        this.database
          .prepare(
            `UPDATE indexed_documents SET title = ?, mime_type = ?, size_bytes = ?, checksum = ?,
               text_status = ?, excerpt = ?, media_id = COALESCE(?, media_id),
               indexed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
          )
          .run(title, mimeType, sizeBytes, checksum, status, excerpt, mediaId ?? null, id);
        this.database.prepare('DELETE FROM documents_fts WHERE rowid = ?').run(id);
      } else {
        id = this.database
          .prepare(
            `INSERT INTO indexed_documents
               (source_id, location, title, mime_type, size_bytes, checksum, text_status, excerpt, media_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            sourceId,
            location,
            title,
            mimeType,
            sizeBytes,
            checksum,
            status,
            excerpt,
            mediaId ?? null,
          ).lastInsertRowid;
      }
      this.database
        .prepare('INSERT INTO documents_fts (rowid, title, body) VALUES (?, ?, ?)')
        .run(id, title, text ?? '');
      return id;
    })();
  }

  search(ftsQuery, limit = 50) {
    return this.database
      .prepare(
        `SELECT d.id, d.title, d.location, d.mime_type, d.text_status, d.media_id, d.indexed_at,
                s.label AS source_label, s.kind AS source_kind,
                snippet(documents_fts, 1, '«', '»', ' … ', 18) AS snippet
         FROM documents_fts
         JOIN indexed_documents d ON d.id = documents_fts.rowid
         JOIN index_sources s ON s.id = d.source_id AND s.deleted_at IS NULL
         WHERE documents_fts MATCH ?
         ORDER BY bm25(documents_fts) LIMIT ?`,
      )
      .all(ftsQuery, limit);
  }

  getSettings() {
    const row = this.database.prepare('SELECT * FROM index_settings WHERE id = 1').get();
    return {
      scheduleEnabled: row.schedule_enabled === 1,
      scheduleHour: row.schedule_hour,
      networkAllowed: row.network_allowed === 1,
      lastScheduledDate: row.last_scheduled_date,
    };
  }

  updateSettings({ scheduleEnabled, scheduleHour, networkAllowed, lastScheduledDate }) {
    const current = this.getSettings();
    this.database
      .prepare(
        `UPDATE index_settings SET schedule_enabled = ?, schedule_hour = ?, network_allowed = ?,
           last_scheduled_date = ? WHERE id = 1`,
      )
      .run(
        (scheduleEnabled ?? current.scheduleEnabled) ? 1 : 0,
        scheduleHour ?? current.scheduleHour,
        (networkAllowed ?? current.networkAllowed) ? 1 : 0,
        lastScheduledDate === undefined ? current.lastScheduledDate : lastScheduledDate,
      );
    return this.getSettings();
  }

  startRun(trigger) {
    return Number(
      this.database.prepare('INSERT INTO index_runs (trigger) VALUES (?)').run(trigger)
        .lastInsertRowid,
    );
  }

  finishRun(id, { status, counts, message }) {
    this.database
      .prepare(
        `UPDATE index_runs SET status = ?, finished_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
           indexed = ?, unchanged = ?, skipped = ?, errors = ?, message = ? WHERE id = ?`,
      )
      .run(status, counts.indexed, counts.unchanged, counts.skipped, counts.errors, message, id);
    return this.database.prepare('SELECT * FROM index_runs WHERE id = ?').get(id);
  }

  listRuns(limit = 20) {
    return this.database.prepare('SELECT * FROM index_runs ORDER BY id DESC LIMIT ?').all(limit);
  }
}
