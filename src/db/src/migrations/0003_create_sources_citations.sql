-- Sources documentaires et citations. Une citation est polymorphe : elle
-- justifie une donnée portée par une personne, un événement, une union ou
-- une filiation, sans dupliquer la source elle-même.

CREATE TABLE sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  author TEXT,
  publication_info TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT
);

CREATE TABLE citations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES sources(id),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('PERSON', 'EVENT', 'UNION', 'PARENTAGE')),
  entity_id INTEGER NOT NULL,
  page TEXT,
  confidence TEXT NOT NULL CHECK (confidence IN ('LOW', 'MEDIUM', 'HIGH')) DEFAULT 'MEDIUM',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT
);

CREATE INDEX idx_citations_source ON citations(source_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_citations_entity ON citations(entity_type, entity_id) WHERE deleted_at IS NULL;
