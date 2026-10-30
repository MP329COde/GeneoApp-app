-- Lieux administrativement évolutifs.
--
-- Un lieu est une entité indépendante des événements qui s'y rapportent, mais
-- son identité administrative change avec le temps : une commune change de
-- nom, fusionne, passe d'un département à un autre (Seine-et-Oise → Yvelines
-- en 1968), un pays change de régime. Écrire le nom du moment dans l'événement
-- fausse les recherches ; écraser le nom du lieu falsifie les actes anciens.
--
-- - `place_type` : nature administrative (commune, département, pays…).
-- - `place_names` : noms successifs ou alternatifs, avec période de validité
--   (années, bornes ouvertes autorisées) et langue.
-- - `place_parents` : rattachement administratif (commune → département →
--   région → pays) valable sur une période. La hiérarchie à une date donnée se
--   résout en suivant les rattachements valides cette année-là.
-- Les années sont des entiers : la granularité des sources (actes, recensements)
-- est rarement plus fine, et le tri/la comparaison restent triviaux.

ALTER TABLE places ADD COLUMN place_type TEXT CHECK (
  place_type IS NULL OR place_type IN (
    'COUNTRY', 'REGION', 'DEPARTMENT', 'COUNTY', 'DISTRICT', 'COMMUNE', 'PARISH',
    'LOCALITY', 'BUILDING', 'OTHER'
  )
);

CREATE TABLE place_names (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  place_id INTEGER NOT NULL REFERENCES places(id),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  language TEXT,
  valid_from_year INTEGER,
  valid_to_year INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT,
  CHECK (valid_from_year IS NULL OR valid_to_year IS NULL OR valid_from_year <= valid_to_year)
);

CREATE INDEX idx_place_names_place ON place_names(place_id) WHERE deleted_at IS NULL;

CREATE TABLE place_parents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  place_id INTEGER NOT NULL REFERENCES places(id),
  parent_place_id INTEGER NOT NULL REFERENCES places(id),
  valid_from_year INTEGER,
  valid_to_year INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT,
  CHECK (place_id != parent_place_id),
  CHECK (valid_from_year IS NULL OR valid_to_year IS NULL OR valid_from_year <= valid_to_year)
);

CREATE INDEX idx_place_parents_place ON place_parents(place_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_place_parents_parent ON place_parents(parent_place_id) WHERE deleted_at IS NULL;
