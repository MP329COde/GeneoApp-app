-- Les notes ne pouvaient viser ni une union (mariage) ni une filiation, alors
-- que les citations le permettaient (cf. 0003_create_sources_citations.sql) :
-- une note de recherche sur un couple ou sur un lien de parenté était
-- impossible à saisir, alors qu'elle l'est sur un événement ou une source.
--
-- Inversement, 'FAMILY' était accepté alors qu'aucune table ne le porte :
-- dans ce modèle une famille est une union (le FAM du GEDCOM mappe sur la
-- table `unions`, cf. src/server/src/gedcom/service.js), si bien qu'une note
-- 'FAMILY' ne pouvait être affichée nulle part et était perdue à jamais.
-- Les notes de ce type sont converties en notes d'union, qui est leur cible
-- réelle ; à défaut (identifiant sans union correspondante), elles sont
-- supprimées, une note orpheline étant sans valeur pour l'utilisateur.
--
-- SQLite n'autorise pas la modification d'une contrainte CHECK existante par
-- ALTER TABLE : reconstruction de la table selon la procédure standard SQLite
-- (créer, copier, supprimer, renommer), en conservant les identifiants.

CREATE TABLE notes_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('PERSON', 'EVENT', 'UNION', 'PARENTAGE', 'SOURCE', 'CITATION', 'PLACE', 'TREE', 'SEARCH')),
  entity_id INTEGER NOT NULL,
  title TEXT,
  body TEXT NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('LOW', 'MEDIUM', 'HIGH')) DEFAULT 'MEDIUM',
  is_contradiction INTEGER NOT NULL CHECK (is_contradiction IN (0, 1)) DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT
);

-- Les notes 'FAMILY' deviennent des notes d'union lorsque l'identifiant
-- désigne effectivement une union ; sinon, elles sont abandonnées.
INSERT INTO notes_new (id, entity_type, entity_id, title, body, confidence, is_contradiction, created_at, updated_at, deleted_at)
SELECT id, entity_type, entity_id, title, body, confidence, is_contradiction,
       created_at, updated_at, deleted_at
FROM notes
WHERE entity_type != 'FAMILY';

INSERT INTO notes_new (id, entity_type, entity_id, title, body, confidence, is_contradiction, created_at, updated_at, deleted_at)
SELECT id, 'UNION', entity_id, title, body, confidence, is_contradiction, created_at, updated_at, deleted_at
FROM notes
WHERE entity_type = 'FAMILY'
  AND entity_id IN (SELECT id FROM unions);

DROP TABLE notes;
ALTER TABLE notes_new RENAME TO notes;

CREATE INDEX idx_notes_entity ON notes(entity_type, entity_id) WHERE deleted_at IS NULL;
