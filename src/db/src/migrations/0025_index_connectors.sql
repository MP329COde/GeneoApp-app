-- Connecteurs de recherche multi-sites (issue #49) : opt-in explicite par
-- connecteur, pages distantes indexées localement dans l'index existant.
--
-- Le catalogue des connecteurs (adresse, modèle de recherche) vit dans le
-- code serveur : le client n'envoie que des valeurs de recherche, jamais une
-- adresse. L'opt-in est enregistré ici, côté serveur, pour qu'aucune
-- requête ne parte sans autorisation explicite de l'utilisateur.

CREATE TABLE index_connectors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  connector_id TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  base_url TEXT NOT NULL,
  -- Autorisation explicite : aucune requête vers un connecteur sans elle.
  opted_in INTEGER NOT NULL DEFAULT 0 CHECK (opted_in IN (0, 1)),
  max_pages INTEGER NOT NULL DEFAULT 20 CHECK (max_pages BETWEEN 1 AND 100),
  -- Source d'indexation portant les pages du connecteur (documents_fts).
  source_id INTEGER REFERENCES index_sources(id),
  last_run_at TEXT,
  last_status TEXT,
  last_message TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Une source d'indexation rattachée à un connecteur : elle n'est jamais
-- explorée par l'indexation générale (elle reste désactivée) et sert
-- uniquement de porte-mots pour les pages du connecteur.
ALTER TABLE index_sources ADD COLUMN connector_id TEXT;
