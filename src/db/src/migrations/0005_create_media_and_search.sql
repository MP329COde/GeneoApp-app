-- Médias attachés à une source et/ou à une entité (preuve numérisée : photo,
-- scan de registre, PDF...). Le contenu binaire n'est jamais stocké en base ;
-- seul le nom de fichier généré (stored_filename, opaque, non dérivé de
-- l'entrée utilisateur) permet de retrouver le fichier sur disque, ce qui
-- évite toute traversée de chemin à la lecture.
CREATE TABLE media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER REFERENCES sources(id),
  entity_type TEXT CHECK (entity_type IN ('PERSON', 'EVENT', 'UNION', 'PARENTAGE', 'SOURCE')),
  entity_id INTEGER,
  original_filename TEXT NOT NULL,
  stored_filename TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  checksum_sha256 TEXT NOT NULL,
  ocr_text TEXT,
  ocr_status TEXT NOT NULL CHECK (ocr_status IN ('PENDING', 'UNAVAILABLE', 'DONE', 'FAILED')) DEFAULT 'PENDING',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT,
  CHECK ((entity_type IS NULL) = (entity_id IS NULL))
);

CREATE INDEX idx_media_source ON media(source_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_media_entity ON media(entity_type, entity_id) WHERE deleted_at IS NULL;

-- Index de recherche locale (FTS5, aucune dépendance réseau). Alimenté
-- explicitement par les dépôts (personnes, lieux, sources, médias) à chaque
-- écriture ; jamais par un service distant.
CREATE VIRTUAL TABLE search_index USING fts5(
  entity_type UNINDEXED,
  entity_id UNINDEXED,
  title,
  body,
  tokenize = 'unicode61'
);
