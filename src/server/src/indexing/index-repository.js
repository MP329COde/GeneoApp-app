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

  createSource({ kind, mode = 'CRAWL', label, location, maxDepth, maxDocuments, resourceFilter }) {
    const result = this.database
      .prepare(
        `INSERT INTO index_sources (kind, mode, label, location, max_depth, max_documents, resource_filter)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(kind, mode, label, location, maxDepth, maxDocuments, resourceFilter ?? null);
    return this.findSource(result.lastInsertRowid);
  }

  /** Mise à jour partielle : seuls les champs fournis changent. */
  updateSource(id, { enabled, label, maxDepth, maxDocuments, resourceFilter }) {
    const current = this.findSource(id);
    this.database
      .prepare(
        `UPDATE index_sources SET enabled = ?, label = ?, max_depth = ?, max_documents = ?,
           resource_filter = ? WHERE id = ?`,
      )
      .run(
        enabled === undefined ? current.enabled : enabled ? 1 : 0,
        label ?? current.label,
        maxDepth ?? current.max_depth,
        maxDocuments ?? current.max_documents,
        resourceFilter === undefined ? current.resource_filter : resourceFilter,
        id,
      );
    return this.findSource(id);
  }

  recordSourceOutcome(id, { status, message }) {
    this.database
      .prepare(
        `UPDATE index_sources SET last_run_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
           last_status = ?, last_message = ? WHERE id = ?`,
      )
      .run(status, message ?? null, id);
  }

  deleteDocuments(where, ...params) {
    const ids = this.database
      .prepare(`SELECT id FROM indexed_documents WHERE ${where}`)
      .all(...params)
      .map((row) => row.id);
    const removeFts = this.database.prepare('DELETE FROM documents_fts WHERE rowid = ?');
    const removeDocument = this.database.prepare('DELETE FROM indexed_documents WHERE id = ?');
    for (const id of ids) {
      removeFts.run(id);
      removeDocument.run(id);
    }
    return ids.length;
  }

  removeSource(id) {
    return this.database.transaction(() => {
      this.deleteDocuments('source_id = ?', id);
      return (
        this.database
          .prepare(
            "UPDATE index_sources SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND deleted_at IS NULL",
          )
          .run(id).changes > 0
      );
    })();
  }

  /** Vide l'index d'une source (réindexation complète à la prochaine exécution). */
  clearSource(id) {
    return this.database.transaction(() => this.deleteDocuments('source_id = ?', id))();
  }

  /**
   * Retire les documents d'une source que l'exécution `runId` n'a pas
   * rencontrés (fichiers supprimés, pages disparues). Appelée seulement
   * lorsqu'une source a été parcourue entièrement.
   */
  pruneUnseen(sourceId, runId) {
    return this.database.transaction(() =>
      this.deleteDocuments(
        'source_id = ? AND (seen_run_id IS NULL OR seen_run_id <> ?)',
        sourceId,
        runId,
      ),
    )();
  }

  findDocument(sourceId, location) {
    return (
      this.database
        .prepare('SELECT * FROM indexed_documents WHERE source_id = ? AND location = ?')
        .get(sourceId, location) ?? null
    );
  }

  /** Marque un document comme rencontré par l'exécution (inchangé ou en erreur passagère). */
  touchDocument(id, runId) {
    this.database
      .prepare('UPDATE indexed_documents SET seen_run_id = ? WHERE id = ?')
      .run(runId, id);
  }

  /** Marque tous les lots d'une ressource ; retourne leur nombre. */
  touchPrefix(sourceId, prefix, runId) {
    return this.database
      .prepare(
        'UPDATE indexed_documents SET seen_run_id = ? WHERE source_id = ? AND substr(location, 1, length(?)) = ?',
      )
      .run(runId, sourceId, prefix, prefix).changes;
  }

  findFirstWithPrefix(sourceId, prefix) {
    return (
      this.database
        .prepare(
          'SELECT * FROM indexed_documents WHERE source_id = ? AND substr(location, 1, length(?)) = ? ORDER BY id LIMIT 1',
        )
        .get(sourceId, prefix, prefix) ?? null
    );
  }

  transaction(fn) {
    return this.database.transaction(fn)();
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
    etag = null,
    lastModified = null,
    links = null,
    runId = null,
  }) {
    return this.database.transaction(() => {
      const existing = this.findDocument(sourceId, location);
      const excerpt = text ? text.replace(/\s+/g, ' ').slice(0, 400) : null;
      const linksJson = links ? JSON.stringify(links.slice(0, 1000)) : null;
      let id;
      if (existing) {
        id = existing.id;
        this.database
          .prepare(
            `UPDATE indexed_documents SET title = ?, mime_type = ?, size_bytes = ?, checksum = ?,
               text_status = ?, excerpt = ?, media_id = COALESCE(?, media_id), etag = ?,
               last_modified = ?, links = ?, seen_run_id = ?,
               indexed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
          )
          .run(
            title,
            mimeType,
            sizeBytes,
            checksum,
            status,
            excerpt,
            mediaId ?? null,
            etag,
            lastModified,
            linksJson,
            runId,
            id,
          );
        this.database.prepare('DELETE FROM documents_fts WHERE rowid = ?').run(id);
      } else {
        id = this.database
          .prepare(
            `INSERT INTO indexed_documents
               (source_id, location, title, mime_type, size_bytes, checksum, text_status, excerpt,
                media_id, etag, last_modified, links, seen_run_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
            etag,
            lastModified,
            linksJson,
            runId,
          ).lastInsertRowid;
      }
      this.database
        .prepare('INSERT INTO documents_fts (rowid, title, body) VALUES (?, ?, ?)')
        .run(id, title, text ?? '');
      return id;
    })();
  }

  searchFilters({ sourceId, status }) {
    const clauses = [];
    const params = [];
    if (sourceId) {
      clauses.push('d.source_id = ?');
      params.push(sourceId);
    }
    if (status) {
      clauses.push('d.text_status = ?');
      params.push(status);
    }
    return { sql: clauses.map((clause) => ` AND ${clause}`).join(''), params };
  }

  search(ftsQuery, { limit = 50, offset = 0, sourceId = null, status = null } = {}) {
    const filters = this.searchFilters({ sourceId, status });
    return this.database
      .prepare(
        `SELECT d.id, d.title, d.location, d.mime_type, d.text_status, d.media_id, d.indexed_at,
                d.source_id, s.label AS source_label, s.kind AS source_kind, s.mode AS source_mode,
                snippet(documents_fts, 1, '«', '»', ' … ', 18) AS snippet
         FROM documents_fts
         JOIN indexed_documents d ON d.id = documents_fts.rowid
         JOIN index_sources s ON s.id = d.source_id AND s.deleted_at IS NULL
         WHERE documents_fts MATCH ?${filters.sql}
         ORDER BY bm25(documents_fts, 5.0, 1.0) LIMIT ? OFFSET ?`,
      )
      .all(ftsQuery, ...filters.params, limit, offset);
  }

  countMatches(ftsQuery, { sourceId = null, status = null } = {}) {
    const filters = this.searchFilters({ sourceId, status });
    return this.database
      .prepare(
        `SELECT COUNT(*) AS total FROM documents_fts
         JOIN indexed_documents d ON d.id = documents_fts.rowid
         JOIN index_sources s ON s.id = d.source_id AND s.deleted_at IS NULL
         WHERE documents_fts MATCH ?${filters.sql}`,
      )
      .get(ftsQuery, ...filters.params).total;
  }

  /** Document indexé avec son texte complet (tel qu'indexé). */
  getDocument(id) {
    const row = this.database
      .prepare(
        `SELECT d.*, s.label AS source_label, s.kind AS source_kind, s.mode AS source_mode,
                s.location AS source_location, f.body AS text
         FROM indexed_documents d
         JOIN index_sources s ON s.id = d.source_id AND s.deleted_at IS NULL
         LEFT JOIN documents_fts f ON f.rowid = d.id
         WHERE d.id = ?`,
      )
      .get(id);
    if (!row) return null;
    const { links, ...document } = row;
    return { ...document, link_count: links ? JSON.parse(links).length : 0 };
  }

  stats() {
    const byStatus = Object.fromEntries(
      this.database
        .prepare(
          `SELECT d.text_status AS status, COUNT(*) AS total FROM indexed_documents d
           JOIN index_sources s ON s.id = d.source_id AND s.deleted_at IS NULL GROUP BY d.text_status`,
        )
        .all()
        .map((row) => [row.status, row.total]),
    );
    return {
      documents: Object.values(byStatus).reduce((sum, total) => sum + total, 0),
      byStatus,
    };
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

  startRun(trigger, sourceId = null) {
    return Number(
      this.database
        .prepare('INSERT INTO index_runs (trigger, source_id) VALUES (?, ?)')
        .run(trigger, sourceId).lastInsertRowid,
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

  /** Exécutions restées « en cours » après un arrêt brutal de l'application. */
  failInterruptedRuns() {
    return this.database
      .prepare(
        `UPDATE index_runs SET status = 'FAILED', finished_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
           message = COALESCE(message, 'Interrompue (application fermée)') WHERE status = 'RUNNING'`,
      )
      .run().changes;
  }

  listRuns(limit = 20) {
    return this.database
      .prepare(
        `SELECT r.*, s.label AS source_label FROM index_runs r
         LEFT JOIN index_sources s ON s.id = r.source_id ORDER BY r.id DESC LIMIT ?`,
      )
      .all(limit);
  }
}
