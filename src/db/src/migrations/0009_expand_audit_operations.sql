-- Étend les opérations d'audit prises en charge pour couvrir la fusion de
-- fiches en doublon (voir MergeService) : la fusion enregistre à la fois une
-- entrée MERGE sur le survivant et une entrée DELETE sur le doublon, dans la
-- même transaction que la réattribution des données.
--
-- SQLite n'autorise pas la modification d'une contrainte CHECK existante par
-- ALTER TABLE : reconstruction de la table selon la procédure standard SQLite
-- (créer, copier, supprimer, renommer), en conservant les identifiants.

CREATE TABLE audit_log_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name TEXT NOT NULL,
  row_id INTEGER NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE', 'RESTORE', 'MERGE')),
  changes TEXT,
  performed_by TEXT,
  performed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO audit_log_new (id, table_name, row_id, operation, changes, performed_by, performed_at)
SELECT id, table_name, row_id, operation, changes, performed_by, performed_at FROM audit_log;

DROP TABLE audit_log;
ALTER TABLE audit_log_new RENAME TO audit_log;

CREATE INDEX idx_audit_log_entity ON audit_log(table_name, row_id);
