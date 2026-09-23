-- Indexation de documents (ADR 0011) : sources (dossiers locaux, sites web),
-- documents indexés, recherche plein texte, réglages et journal des exécutions.
-- L'index est reconstructible : hors historique annulable et hors sauvegardes logiques.

CREATE TABLE index_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('FOLDER', 'SITE')),
  label TEXT NOT NULL,
  location TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  max_depth INTEGER NOT NULL DEFAULT 2 CHECK (max_depth BETWEEN 0 AND 10),
  max_documents INTEGER NOT NULL DEFAULT 200 CHECK (max_documents BETWEEN 1 AND 5000),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT
);

CREATE TABLE indexed_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES index_sources(id),
  location TEXT NOT NULL,
  title TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER,
  checksum TEXT,
  text_status TEXT NOT NULL CHECK (text_status IN ('EXTRACTED', 'OCR', 'UNAVAILABLE')),
  excerpt TEXT,
  media_id INTEGER REFERENCES media(id),
  indexed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (source_id, location)
);

CREATE VIRTUAL TABLE documents_fts USING fts5(title, body, tokenize = 'unicode61 remove_diacritics 2');

CREATE TABLE index_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  schedule_enabled INTEGER NOT NULL DEFAULT 0 CHECK (schedule_enabled IN (0, 1)),
  schedule_hour INTEGER NOT NULL DEFAULT 2 CHECK (schedule_hour BETWEEN 0 AND 23),
  network_allowed INTEGER NOT NULL DEFAULT 0 CHECK (network_allowed IN (0, 1)),
  last_scheduled_date TEXT
);
INSERT INTO index_settings (id) VALUES (1);

CREATE TABLE index_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trigger TEXT NOT NULL CHECK (trigger IN ('MANUAL', 'SCHEDULED', 'CLI')),
  status TEXT NOT NULL CHECK (status IN ('RUNNING', 'DONE', 'FAILED')) DEFAULT 'RUNNING',
  started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  finished_at TEXT,
  indexed INTEGER NOT NULL DEFAULT 0,
  unchanged INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  message TEXT
);
