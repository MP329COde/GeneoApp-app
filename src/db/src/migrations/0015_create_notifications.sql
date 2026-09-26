-- Notifications locales de l'application : événements importants et état de lecture.
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL DEFAULT 'success',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC, id DESC);
CREATE INDEX idx_notifications_unread ON notifications(read_at, created_at DESC, id DESC);