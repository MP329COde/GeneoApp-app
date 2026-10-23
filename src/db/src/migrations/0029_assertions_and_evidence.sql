-- Assertions, niveaux de preuve et contradictions.
--
-- Une fiche porte aujourd'hui UNE valeur par champ : dès que deux sources se
-- contredisent (naissance le 3 mars selon l'acte, le 5 mars selon le livret de
-- famille), il faut choisir en écrasant l'autre, ou l'écarter dans une note
-- libre. Le cahier des charges demande l'inverse : conserver chaque affirmation
-- avec ses sources, et signaler les contradictions sans les trancher seul.
--
-- - `assertions` : une affirmation = (entité, champ, valeur) avec son statut
--   (proposée, retenue, écartée) et un niveau de preuve choisi par l'humain.
--   Plusieurs affirmations de valeurs différentes pour un même champ sont des
--   contradictions, détectées à la lecture ; une seule peut être retenue.
-- - Les citations peuvent désormais cibler une affirmation (ou un lieu), et
--   qualifient la preuve selon la méthode généalogique usuelle : nature de la
--   preuve (directe, indirecte, négative) et qualité de l'information
--   (primaire, secondaire). `sources.source_kind` distingue l'original, le
--   dérivé (copie, transcription) et l'ouvrage d'auteur.
--
-- La table des citations est reconstruite (la contrainte CHECK sur le type
-- d'entité ne se modifie pas par ALTER TABLE) en conservant les identifiants.

ALTER TABLE sources ADD COLUMN source_kind TEXT NOT NULL DEFAULT 'UNKNOWN'
  CHECK (source_kind IN ('ORIGINAL', 'DERIVATIVE', 'AUTHORED', 'UNKNOWN'));

CREATE TABLE citations_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES sources(id),
  entity_type TEXT NOT NULL CHECK (
    entity_type IN ('PERSON', 'EVENT', 'UNION', 'PARENTAGE', 'PLACE', 'ASSERTION')
  ),
  entity_id INTEGER NOT NULL,
  page TEXT,
  confidence TEXT NOT NULL CHECK (confidence IN ('LOW', 'MEDIUM', 'HIGH')) DEFAULT 'MEDIUM',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT,
  evidence_type TEXT NOT NULL DEFAULT 'UNKNOWN'
    CHECK (evidence_type IN ('DIRECT', 'INDIRECT', 'NEGATIVE', 'UNKNOWN')),
  information_quality TEXT NOT NULL DEFAULT 'UNKNOWN'
    CHECK (information_quality IN ('PRIMARY', 'SECONDARY', 'UNKNOWN')),
  quotation TEXT
);

INSERT INTO citations_new (
  id, source_id, entity_type, entity_id, page, confidence, notes, created_at, updated_at, deleted_at
)
SELECT id, source_id, entity_type, entity_id, page, confidence, notes, created_at, updated_at, deleted_at
FROM citations;

DROP TABLE citations;
ALTER TABLE citations_new RENAME TO citations;

CREATE INDEX idx_citations_source ON citations(source_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_citations_entity ON citations(entity_type, entity_id) WHERE deleted_at IS NULL;

CREATE TABLE assertions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL CHECK (
    entity_type IN ('PERSON', 'EVENT', 'UNION', 'PARENTAGE', 'PLACE')
  ),
  entity_id INTEGER NOT NULL,
  field TEXT NOT NULL CHECK (length(field) BETWEEN 1 AND 60),
  value TEXT NOT NULL CHECK (length(trim(value)) > 0),
  status TEXT NOT NULL DEFAULT 'PROPOSED' CHECK (status IN ('PROPOSED', 'ACCEPTED', 'REJECTED')),
  proof_level TEXT NOT NULL DEFAULT 'UNSUPPORTED'
    CHECK (proof_level IN ('UNSUPPORTED', 'POSSIBLE', 'PROBABLE', 'PROVEN')),
  reasoning TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT
);

CREATE INDEX idx_assertions_entity ON assertions(entity_type, entity_id, field) WHERE deleted_at IS NULL;
-- Une seule valeur retenue par champ ; les autres restent consultables.
CREATE UNIQUE INDEX idx_assertions_accepted
  ON assertions(entity_type, entity_id, field)
  WHERE status = 'ACCEPTED' AND deleted_at IS NULL;
