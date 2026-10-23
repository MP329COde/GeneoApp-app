-- Complète l'identité d'une personne et la nature des filiations.
--
-- 1. `alias` : distinct du surnom (`nickname`). Un alias est un autre nom sous
--    lequel la personne est connue (nom d'usage, nom de plume, nom francisé) ;
--    le surnom est un sobriquet. Le cahier des charges demande les deux.
-- 2. `is_private` : drapeau « information privée », indépendant du statut
--    vivant/décédé. Une personne décédée peut avoir une fiche à ne pas
--    divulguer (GEDCOM RESN).
-- 3. `person_identifiers` : identifiants externes d'une personne dans d'autres
--    systèmes (FamilySearch, Geneanet, WikiTree, Wikidata…), plusieurs par
--    schéma possible. `persons.external_id` reste l'identifiant principal de
--    réconciliation d'import (référence GEDCOM d'origine) ; cette table porte
--    les identifiants supplémentaires, sans écraser ni dupliquer l'existant.
-- 4. Filiation par tutelle (`GUARDIAN`) : un tuteur légal n'est ni un parent
--    adoptif, ni nourricier, ni par alliance. Reconstruction de `parentages`
--    (la contrainte CHECK ne se modifie pas par ALTER TABLE) en conservant les
--    identifiants.

ALTER TABLE persons ADD COLUMN alias TEXT;
ALTER TABLE persons ADD COLUMN is_private INTEGER NOT NULL DEFAULT 0 CHECK (is_private IN (0, 1));

CREATE TABLE person_identifiers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id INTEGER NOT NULL REFERENCES persons(id),
  scheme TEXT NOT NULL CHECK (length(scheme) BETWEEN 1 AND 40),
  value TEXT NOT NULL CHECK (length(value) BETWEEN 1 AND 200),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT
);

CREATE UNIQUE INDEX idx_person_identifiers_unique
  ON person_identifiers(person_id, scheme, value)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_person_identifiers_lookup
  ON person_identifiers(scheme, value)
  WHERE deleted_at IS NULL;

CREATE TABLE parentages_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id INTEGER NOT NULL REFERENCES persons(id),
  parent_id INTEGER NOT NULL REFERENCES persons(id),
  parent_role TEXT NOT NULL CHECK (parent_role IN ('FATHER', 'MOTHER', 'PARENT')) DEFAULT 'PARENT',
  link_type TEXT NOT NULL CHECK (
    link_type IN ('BIOLOGICAL', 'ADOPTIVE', 'FOSTER', 'STEP', 'GUARDIAN', 'UNKNOWN')
  ) DEFAULT 'BIOLOGICAL',
  union_id INTEGER REFERENCES unions(id),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT,
  CHECK (child_id != parent_id)
);

INSERT INTO parentages_new (
  id, child_id, parent_id, parent_role, link_type, union_id, notes, created_at, updated_at, deleted_at
)
SELECT id, child_id, parent_id, parent_role, link_type, union_id, notes, created_at, updated_at, deleted_at
FROM parentages;

DROP TABLE parentages;
ALTER TABLE parentages_new RENAME TO parentages;

CREATE UNIQUE INDEX idx_parentages_unique
  ON parentages(child_id, parent_id)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_parentages_child ON parentages(child_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_parentages_parent ON parentages(parent_id) WHERE deleted_at IS NULL;
