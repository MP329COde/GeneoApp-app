-- Reconstruction de l'index de recherche locale (voir l'étape JavaScript
-- associée, 0021_reindex_search_index.js).
--
-- L'index de recherche (table FTS5 `search_index`) est alimenté à la main
-- par les dépôts métier à chaque écriture. Les écritures faites en SQL
-- direct — l'import GEDCOM, notamment — ne l'alimentaient pas : les
-- personnes importées depuis un fichier GEDCOM restaient donc introuvables
-- par la recherche locale, alors qu'elles étaient bien présentes dans
-- l'arbre.
--
-- Cette migration reconstruit l'index à partir des tables sources. Le
-- contenu déjà indexé est inchangé (le format d'indexation est aligné sur
-- celui des dépôts) : seules les fiches qui manquaient à l'index y
-- entrent.
--
-- Aucune modification de schéma n'est nécessaire : la migration est là
-- pour porter l'étape JavaScript, qui ne peut pas s'écrire en SQL.

SELECT 1;
