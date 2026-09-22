CREATE TABLE notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('PERSON', 'FAMILY', 'EVENT', 'SOURCE', 'CITATION', 'PLACE', 'TREE', 'SEARCH')),
  entity_id INTEGER NOT NULL,
  title TEXT,
  body TEXT NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('LOW', 'MEDIUM', 'HIGH')) DEFAULT 'MEDIUM',
  is_contradiction INTEGER NOT NULL CHECK (is_contradiction IN (0, 1)) DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT
);

CREATE INDEX idx_notes_entity ON notes(entity_type, entity_id) WHERE deleted_at IS NULL;
