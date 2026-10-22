-- Éléments GEDCOM que GeneoApp ne sait pas (encore) représenter.
--
-- Un fichier GEDCOM réel contient des balises propres au logiciel d'origine
-- (_MILT, _FSFTID), des balises standard hors du modèle (ASSO, ADDR, AGE, CAUS,
-- CHAN) et des événements génériques (EVEN) sans type connu. Les ignorer à
-- l'import perd des données sans le dire ; les conserver permet de les rendre
-- à l'export, au rang que leur donnait le fichier, et de les signaler dans le
-- rapport d'import.
--
-- `payload` contient le sous-arbre original ({ tag, value, children }) en JSON.
-- La cible est polymorphe (personne, union ou événement), comme pour les notes
-- et les citations : la corbeille et la fusion s'en chargent explicitement.

CREATE TABLE gedcom_extensions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('PERSON', 'UNION', 'EVENT')),
  entity_id INTEGER NOT NULL,
  tag TEXT NOT NULL CHECK (length(tag) BETWEEN 1 AND 40),
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT
);

CREATE INDEX idx_gedcom_extensions_entity
  ON gedcom_extensions(entity_type, entity_id) WHERE deleted_at IS NULL;
