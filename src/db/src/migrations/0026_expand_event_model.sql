-- Complète le modèle d'événements pour couvrir le cahier des charges.
--
-- 1. Types : migration générique, succession et engagement religieux
--    n'avaient pas de type propre (rangés sous OTHER ou RELIGIOUS_EVENT, sans
--    pouvoir les distinguer).
-- 2. Précision de date : « estimée » et « calculée » (qualificatifs GEDCOM EST
--    et CAL) étaient écrasées sur « vers » à l'enregistrement, ce qui perdait
--    la nature de l'incertitude.
-- 3. Rôles des participants : un événement peut réunir un nombre quelconque
--    de participants (parrain, informateur, tuteur, héritier, parents et
--    enfants d'un acte…), alors que seuls cinq rôles étaient acceptés.
--
-- SQLite n'autorise pas la modification d'une contrainte CHECK existante par
-- ALTER TABLE : reconstruction des tables selon la procédure standard (créer,
-- copier, supprimer, renommer), en conservant les identifiants. Les clés
-- étrangères sont suspendues par le migrateur pour toute migration qui
-- supprime une table, puis l'intégrité est vérifiée.

CREATE TABLE events_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (
    type IN (
      'BIRTH', 'DEATH', 'MARRIAGE', 'DIVORCE', 'BAPTISM', 'BURIAL', 'ADOPTION',
      'OCCUPATION', 'RESIDENCE', 'EMIGRATION', 'IMMIGRATION', 'MIGRATION', 'CENSUS',
      'MILITARY', 'GRADUATION', 'WILL', 'PROBATE', 'SUCCESSION', 'RELIGIOUS_EVENT',
      'RELIGIOUS_COMMITMENT', 'NATURALIZATION', 'OTHER'
    )
  ),
  date_text TEXT,
  date_precision TEXT NOT NULL CHECK (
    date_precision IN (
      'EXACT', 'ABOUT', 'ESTIMATED', 'CALCULATED', 'BEFORE', 'AFTER', 'BETWEEN', 'UNKNOWN'
    )
  ) DEFAULT 'UNKNOWN',
  place_id INTEGER REFERENCES places(id),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT,
  value TEXT
);

INSERT INTO events_new (
  id, type, date_text, date_precision, place_id, notes, created_at, updated_at, deleted_at, value
)
SELECT id, type, date_text, date_precision, place_id, notes, created_at, updated_at, deleted_at, value
FROM events;

CREATE TABLE event_participants_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id),
  person_id INTEGER NOT NULL REFERENCES persons(id),
  role TEXT NOT NULL CHECK (
    role IN (
      'PRINCIPAL', 'PARTNER1', 'PARTNER2', 'WITNESS', 'OFFICIANT',
      'FATHER', 'MOTHER', 'CHILD', 'GODPARENT', 'INFORMANT', 'GUARDIAN', 'HEIR', 'OTHER'
    )
  ),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT
);

INSERT INTO event_participants_new (
  id, event_id, person_id, role, created_at, updated_at, deleted_at
)
SELECT id, event_id, person_id, role, created_at, updated_at, deleted_at
FROM event_participants;

DROP TABLE event_participants;
DROP TABLE events;
ALTER TABLE events_new RENAME TO events;
ALTER TABLE event_participants_new RENAME TO event_participants;

CREATE INDEX idx_events_type ON events(type) WHERE deleted_at IS NULL;
CREATE INDEX idx_events_place ON events(place_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_event_participants_unique
  ON event_participants(event_id, person_id, role)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_event_participants_person ON event_participants(person_id) WHERE deleted_at IS NULL;
