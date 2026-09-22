-- Individus, lieux et événements.
-- Un événement est une entité autonome (naissance, mariage, décès...) reliée
-- à ses participants via une table de jonction typée par rôle : contrairement
-- à un enregistrement GEDCOM INDI/FAM, un même événement peut avoir un nombre
-- quelconque de participants avec des rôles distincts (témoin, officiant...).

CREATE TABLE persons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  given_names TEXT NOT NULL,
  family_name TEXT NOT NULL,
  birth_family_name TEXT,
  sex TEXT NOT NULL CHECK (sex IN ('M', 'F', 'U')) DEFAULT 'U',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT
);

CREATE INDEX idx_persons_family_name ON persons(family_name) WHERE deleted_at IS NULL;

CREATE TABLE places (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT
);

CREATE UNIQUE INDEX idx_places_normalized_name ON places(normalized_name) WHERE deleted_at IS NULL;

CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (
    type IN ('BIRTH', 'DEATH', 'MARRIAGE', 'DIVORCE', 'BAPTISM', 'BURIAL', 'ADOPTION', 'OTHER')
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

CREATE INDEX idx_events_type ON events(type) WHERE deleted_at IS NULL;
CREATE INDEX idx_events_place ON events(place_id) WHERE deleted_at IS NULL;

CREATE TABLE event_participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id),
  person_id INTEGER NOT NULL REFERENCES persons(id),
  role TEXT NOT NULL CHECK (
    role IN ('PRINCIPAL', 'PARTNER1', 'PARTNER2', 'WITNESS', 'OFFICIANT')
  ),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT
);

CREATE UNIQUE INDEX idx_event_participants_unique
  ON event_participants(event_id, person_id, role)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_event_participants_person ON event_participants(person_id) WHERE deleted_at IS NULL;
