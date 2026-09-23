-- Photos : métadonnées (date, lieu, description, tags) et identification
-- manuelle des personnes présentes par zones rectangulaires. Coordonnées
-- relatives (0 à 1) : indépendantes de la résolution d'affichage.

ALTER TABLE media ADD COLUMN taken_date TEXT;
ALTER TABLE media ADD COLUMN place_id INTEGER REFERENCES places(id);
ALTER TABLE media ADD COLUMN description TEXT;
ALTER TABLE media ADD COLUMN tags TEXT;

CREATE TABLE media_regions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  media_id INTEGER NOT NULL REFERENCES media(id),
  person_id INTEGER REFERENCES persons(id),
  label TEXT,
  x REAL NOT NULL CHECK (x >= 0 AND x <= 1),
  y REAL NOT NULL CHECK (y >= 0 AND y <= 1),
  width REAL NOT NULL CHECK (width > 0 AND width <= 1),
  height REAL NOT NULL CHECK (height > 0 AND height <= 1),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT,
  CHECK (x + width <= 1.0001 AND y + height <= 1.0001),
  CHECK (person_id IS NOT NULL OR label IS NOT NULL)
);

CREATE INDEX idx_media_regions_media ON media_regions(media_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_media_regions_person ON media_regions(person_id) WHERE deleted_at IS NULL;
