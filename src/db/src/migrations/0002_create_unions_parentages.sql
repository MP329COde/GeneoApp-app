-- Unions et filiations, modélisées séparément (au lieu d'un enregistrement
-- FAM GEDCOM unique mêlant couple et enfants) afin de représenter des
-- structures familiales non conventionnelles : demi-fratries, adoptions,
-- familles recomposées, enfant sans union parentale connue, etc.

CREATE TABLE unions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (
    type IN ('MARRIAGE', 'CIVIL_PARTNERSHIP', 'COHABITATION', 'OTHER')
  ) DEFAULT 'OTHER',
  start_event_id INTEGER REFERENCES events(id),
  end_event_id INTEGER REFERENCES events(id),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT
);

CREATE TABLE union_partners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  union_id INTEGER NOT NULL REFERENCES unions(id),
  person_id INTEGER NOT NULL REFERENCES persons(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT
);

CREATE UNIQUE INDEX idx_union_partners_unique
  ON union_partners(union_id, person_id)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_union_partners_person ON union_partners(person_id) WHERE deleted_at IS NULL;

-- Chaque lien parent/enfant est indépendant : un enfant peut avoir 0, 1, 2
-- ou plus de parents enregistrés, chacun avec son propre type de filiation.
CREATE TABLE parentages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id INTEGER NOT NULL REFERENCES persons(id),
  parent_id INTEGER NOT NULL REFERENCES persons(id),
  parent_role TEXT NOT NULL CHECK (parent_role IN ('FATHER', 'MOTHER', 'PARENT')) DEFAULT 'PARENT',
  link_type TEXT NOT NULL CHECK (
    link_type IN ('BIOLOGICAL', 'ADOPTIVE', 'FOSTER', 'STEP', 'UNKNOWN')
  ) DEFAULT 'BIOLOGICAL',
  union_id INTEGER REFERENCES unions(id),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT,
  CHECK (child_id != parent_id)
);

CREATE UNIQUE INDEX idx_parentages_unique
  ON parentages(child_id, parent_id)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_parentages_child ON parentages(child_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_parentages_parent ON parentages(parent_id) WHERE deleted_at IS NULL;
