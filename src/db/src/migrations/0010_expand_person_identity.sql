-- Étend l'identité d'une personne pour couvrir ce que le cahier des charges
-- exige et qui manquait entièrement : alias/surnom, nom marital, titre,
-- suffixe, statut « personne vivante » (protège les données sensibles d'une
-- personne potentiellement encore en vie) et identifiant externe/GEDCOM
-- (permet de réconcilier un futur ré-import avec une fiche déjà existante,
-- au lieu de systématiquement créer un doublon détecté après coup).
--
-- Toutes les colonnes sont nullables sans contrainte CHECK ni valeur requise
-- (hormis is_living, qui a un défaut) : ALTER TABLE ADD COLUMN suffit, pas
-- besoin de reconstruire la table comme pour une contrainte CHECK existante.

ALTER TABLE persons ADD COLUMN nickname TEXT;
ALTER TABLE persons ADD COLUMN married_name TEXT;
ALTER TABLE persons ADD COLUMN title TEXT;
ALTER TABLE persons ADD COLUMN suffix TEXT;
ALTER TABLE persons ADD COLUMN is_living INTEGER NOT NULL DEFAULT 1 CHECK (is_living IN (0, 1));
ALTER TABLE persons ADD COLUMN external_id TEXT;

CREATE INDEX idx_persons_external_id ON persons(external_id) WHERE external_id IS NOT NULL;
