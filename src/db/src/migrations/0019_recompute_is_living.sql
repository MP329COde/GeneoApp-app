-- `is_living` valait 1 par défaut même pour des personnes nées il y a
-- plusieurs siècles. Corrige les bases existantes selon la même règle que
-- la création et l'import GEDCOM (voir src/db/src/genealogy/living-status.js) :
-- décès/inhumation enregistrés, OU naissance/baptême de plus de 110 ans.
-- Le calcul d'année s'appuie sur GENEALOGY_YEAR (voir database.js), qui
-- réutilise le même lecteur de dates que le reste de l'application.

-- Journalise chaque correction avant de l'appliquer (is_living est encore à 1
-- pour les lignes concernées à cet instant).
INSERT INTO audit_log (table_name, row_id, operation, changes, performed_by)
SELECT 'persons', persons.id, 'UPDATE',
       '{"isLiving":false,"reason":"migration 0019 : décès/inhumation enregistré ou naissance/baptême de plus de 110 ans"}',
       'migration:0019_recompute_is_living'
FROM persons
WHERE is_living = 1
  AND id IN (
    SELECT ep.person_id
    FROM event_participants ep
    JOIN events e ON e.id = ep.event_id
    WHERE ep.role = 'PRINCIPAL'
      AND ep.deleted_at IS NULL
      AND e.deleted_at IS NULL
      AND (
        e.type IN ('DEATH', 'BURIAL')
        OR (
          e.type IN ('BIRTH', 'BAPTISM')
          AND GENEALOGY_YEAR(e.date_text) IS NOT NULL
          AND (CAST(strftime('%Y', 'now') AS INTEGER) - GENEALOGY_YEAR(e.date_text)) > 110
        )
      )
  );

UPDATE persons
SET is_living = 0,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE is_living = 1
  AND id IN (
    SELECT ep.person_id
    FROM event_participants ep
    JOIN events e ON e.id = ep.event_id
    WHERE ep.role = 'PRINCIPAL'
      AND ep.deleted_at IS NULL
      AND e.deleted_at IS NULL
      AND (
        e.type IN ('DEATH', 'BURIAL')
        OR (
          e.type IN ('BIRTH', 'BAPTISM')
          AND GENEALOGY_YEAR(e.date_text) IS NOT NULL
          AND (CAST(strftime('%Y', 'now') AS INTEGER) - GENEALOGY_YEAR(e.date_text)) > 110
        )
      )
  );
