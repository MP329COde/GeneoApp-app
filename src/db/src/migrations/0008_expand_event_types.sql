-- Étend les types d'événements pris en charge. Le socle initial ne couvrait que
-- naissance/décès/mariage/divorce/baptême/sépulture/adoption : le cahier des
-- charges exige aussi profession, résidence, migration, recensement, événement
-- militaire, diplôme, testament, succession, engagement religieux et
-- naturalisation, avant quoi ils étaient silencieusement rangés sous 'OTHER'
-- sans possibilité de les distinguer.
--
-- SQLite n'autorise pas la modification d'une contrainte CHECK existante par
-- ALTER TABLE : reconstruction de la table selon la procédure standard SQLite
-- (créer, copier, supprimer, renommer), en conservant les identifiants.

CREATE TABLE events_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (
    type IN (
      'BIRTH', 'DEATH', 'MARRIAGE', 'DIVORCE', 'BAPTISM', 'BURIAL', 'ADOPTION',
      'OCCUPATION', 'RESIDENCE', 'EMIGRATION', 'IMMIGRATION', 'CENSUS', 'MILITARY',
      'GRADUATION', 'WILL', 'PROBATE', 'RELIGIOUS_EVENT', 'NATURALIZATION', 'OTHER'
    )
  ),
  date_text TEXT,
  date_precision TEXT NOT NULL CHECK (
    date_precision IN ('EXACT', 'ABOUT', 'BEFORE', 'AFTER', 'BETWEEN', 'UNKNOWN')
  ) DEFAULT 'UNKNOWN',
  place_id INTEGER REFERENCES places(id),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT
);

INSERT INTO events_new (id, type, date_text, date_precision, place_id, notes, created_at, updated_at, deleted_at)
SELECT id, type, date_text, date_precision, place_id, notes, created_at, updated_at, deleted_at FROM events;

DROP TABLE events;
ALTER TABLE events_new RENAME TO events;

CREATE INDEX idx_events_type ON events(type) WHERE deleted_at IS NULL;
CREATE INDEX idx_events_place ON events(place_id) WHERE deleted_at IS NULL;
