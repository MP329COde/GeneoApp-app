-- Journal d'audit réellement « ajout seul ».
--
-- La documentation promettait un journal append-only, mais rien ne l'imposait :
-- n'importe quel code (ou une requête SQL erronée) pouvait modifier ou effacer
-- l'historique des modifications. Désormais :
--   - aucune ligne ne peut être modifiée, jamais ;
--   - aucune ligne ne peut être supprimée, sauf pendant la purge explicite
--     demandée par l'utilisateur ou la restauration complète d'une sauvegarde,
--     qui ouvrent une fenêtre transactionnelle (`audit_state.allow_purge`).
-- Annuler / rétablir une action est lui-même journalisé (UNDO, REDO) au lieu de
-- laisser le journal décrire un état que l'utilisateur a défait.
--
-- Reconstruction de la table (la contrainte CHECK des opérations ne se modifie
-- pas par ALTER TABLE) ; toute future reconstruction devra recréer ces déclencheurs.

CREATE TABLE audit_log_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name TEXT NOT NULL,
  row_id INTEGER NOT NULL,
  operation TEXT NOT NULL CHECK (
    operation IN ('INSERT', 'UPDATE', 'DELETE', 'RESTORE', 'MERGE', 'UNDO', 'REDO')
  ),
  changes TEXT,
  performed_by TEXT,
  performed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO audit_log_new (id, table_name, row_id, operation, changes, performed_by, performed_at)
SELECT id, table_name, row_id, operation, changes, performed_by, performed_at FROM audit_log;

DROP TABLE audit_log;
ALTER TABLE audit_log_new RENAME TO audit_log;

CREATE INDEX idx_audit_log_entity ON audit_log(table_name, row_id);

-- Une seule ligne : 1 uniquement le temps d'une purge ou d'une restauration autorisée.
CREATE TABLE audit_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  allow_purge INTEGER NOT NULL DEFAULT 0 CHECK (allow_purge IN (0, 1))
);
INSERT INTO audit_state (id, allow_purge) VALUES (1, 0);

CREATE TRIGGER audit_log_no_update
BEFORE UPDATE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'audit_log est en ajout seul : modification interdite');
END;

CREATE TRIGGER audit_log_no_delete
BEFORE DELETE ON audit_log
WHEN (SELECT allow_purge FROM audit_state WHERE id = 1) = 0
BEGIN
  SELECT RAISE(ABORT, 'audit_log est en ajout seul : suppression interdite hors purge autorisée');
END;
