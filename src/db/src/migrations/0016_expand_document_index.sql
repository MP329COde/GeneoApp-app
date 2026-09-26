-- Indexation approfondie (ADR 0012) : sources de données ouvertes (fichier
-- direct, jeu de données data.gouv.fr), requêtes conditionnelles, purge des
-- documents disparus, état par source et exécutions ciblées.
--
-- Colonnes ajoutées (ALTER TABLE ADD COLUMN) plutôt qu'une reconstruction :
-- indexed_documents référence index_sources par clé étrangère.

-- Mode d'une source réseau (kind = 'SITE') : exploration des liens, fichier
-- direct, ou catalogue data.gouv.fr. Les dossiers gardent 'CRAWL' (inutilisé).
ALTER TABLE index_sources ADD COLUMN mode TEXT NOT NULL DEFAULT 'CRAWL'
  CHECK (mode IN ('CRAWL', 'DIRECT', 'DATAGOUV'));
-- Filtre des ressources d'un jeu de données (texte contenu dans le titre ou l'adresse).
ALTER TABLE index_sources ADD COLUMN resource_filter TEXT;
ALTER TABLE index_sources ADD COLUMN last_run_at TEXT;
ALTER TABLE index_sources ADD COLUMN last_status TEXT;
ALTER TABLE index_sources ADD COLUMN last_message TEXT;

ALTER TABLE indexed_documents ADD COLUMN etag TEXT;
ALTER TABLE indexed_documents ADD COLUMN last_modified TEXT;
-- Liens sortants d'une page (JSON) : exploration possible même si la page
-- répond « 304 inchangée ».
ALTER TABLE indexed_documents ADD COLUMN links TEXT;
-- Dernière exécution ayant rencontré le document : les autres sont purgés
-- lorsqu'une source a été parcourue entièrement.
ALTER TABLE indexed_documents ADD COLUMN seen_run_id INTEGER;

ALTER TABLE index_runs ADD COLUMN source_id INTEGER;

CREATE INDEX idx_indexed_documents_source ON indexed_documents(source_id, seen_run_id);
