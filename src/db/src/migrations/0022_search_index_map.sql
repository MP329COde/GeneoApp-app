-- Table de correspondance entre une entité indexée et la ligne de l'index
-- FTS5 (`search_index`) qui la décrit.
--
-- FTS5 n'autorise ni index secondaire ni trigger (`cannot create triggers on
-- virtual tables`), et ses colonnes `entity_type`/`entity_id` sont marquées
-- UNINDEXED : une recherche par couple (`entity_type`, `entity_id`) est donc
-- un SCAN complet de l'index. Or c'est exactement ce que fait le dépôt
-- métier à chaque écriture d'une fiche — pour supprimer l'entrée périmée,
-- puis insérer la nouvelle. Sur une base de plusieurs dizaines de milliers
-- de fiches, chaque écriture parcourt ainsi l'index entier.
--
-- Cette table tient la correspondance à jour : elle permet de retrouver la
-- ligne FTS5 d'une entité par index, et donc de la supprimer par `rowid`
-- (accès direct) au lieu de parcourir l'index.
--
-- La table est reconstruite depuis l'index FTS5 : la correspondance est
-- dérivée, l'index en reste la source de vérité.

CREATE TABLE search_index_map (
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  rowid INTEGER NOT NULL,
  PRIMARY KEY (entity_type, entity_id)
);

-- La clé primaire porte sur le couple (type, identifiant) : une entité
-- n'a qu'une seule ligne dans l'index. Les doublons éventuels (une
-- réindexation mal interruption) sont résolus en gardant la ligne la plus
-- ancienne, qui correspond à l'entrée réellement lue par la recherche.
DELETE FROM search_index
WHERE rowid NOT IN (
  SELECT MIN(rowid) FROM search_index GROUP BY entity_type, entity_id
);

INSERT INTO search_index_map (entity_type, entity_id, rowid)
SELECT entity_type, entity_id, rowid FROM search_index;

CREATE INDEX idx_search_index_map_rowid ON search_index_map (rowid);
