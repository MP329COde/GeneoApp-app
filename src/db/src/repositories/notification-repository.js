const MAX_LIMIT = 100;

export class NotificationRepository {
  constructor(database) {
    this.database = database;
  }

  create({ type = 'success', title, message, personId = null, dedupeKey = null }) {
    // Une clé déjà connue (même alerte de vérification) n'est jamais republiée.
    const result = this.database
      .prepare(
        `INSERT OR IGNORE INTO notifications (type, title, message, person_id, dedupe_key)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(type, title, message, personId, dedupeKey);
    return result.changes ? this.get(result.lastInsertRowid) : null;
  }

  list({ limit = 50, unreadOnly = false } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), MAX_LIMIT);
    const where = unreadOnly ? 'WHERE read_at IS NULL' : '';
    return this.database
      .prepare(
        `SELECT id, type, title, message, person_id, read_at, created_at
         FROM notifications ${where} ORDER BY created_at DESC, id DESC LIMIT ?`,
      )
      .all(safeLimit);
  }

  get(id) {
    return this.database.prepare('SELECT * FROM notifications WHERE id = ?').get(id) ?? null;
  }

  countUnread() {
    return this.database
      .prepare('SELECT COUNT(*) AS count FROM notifications WHERE read_at IS NULL')
      .get().count;
  }

  markRead(id) {
    this.database
      .prepare(
        "UPDATE notifications SET read_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
      )
      .run(id);
    return this.get(id);
  }

  markAllRead() {
    const result = this.database
      .prepare(
        "UPDATE notifications SET read_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE read_at IS NULL",
      )
      .run();
    return { updated: result.changes, unread: 0 };
  }
}
