-- Historique annulable (Ctrl+Z / Ctrl+Shift+Z). Chaque action utilisateur
-- forme un groupe ; les triggers (installés par history/undo-history.js,
-- régénérés à chaque ouverture pour suivre l'évolution du schéma) y
-- consignent l'image avant/après de chaque ligne modifiée. Contrairement à
-- audit_log (traçabilité, append-only), ce journal sert à rejouer l'inverse.

CREATE TABLE undo_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  performed_by TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  undone INTEGER NOT NULL DEFAULT 0 CHECK (undone IN (0, 1))
);

CREATE TABLE undo_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES undo_groups(id) ON DELETE CASCADE,
  table_name TEXT NOT NULL,
  row_id INTEGER NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  old_row TEXT,
  new_row TEXT
);

CREATE INDEX idx_undo_entries_group ON undo_entries(group_id);

-- Une seule ligne : le groupe en cours d'enregistrement (NULL = pas d'enregistrement).
CREATE TABLE undo_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  current_group INTEGER
);

INSERT INTO undo_state (id, current_group) VALUES (1, NULL);
