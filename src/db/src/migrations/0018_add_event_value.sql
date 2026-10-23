-- Ajoute la valeur métier d'un événement/attribut GEDCOM (ex. "1 OCCU Ingénieur",
-- "1 EDUC Licence de droit", "1 RELI Catholique") : ce texte sur la ligne du tag
-- lui-même était jusqu'ici totalement perdu à l'import (seuls type, date, lieu et
-- notes étaient conservés), ce qui constitue une perte de données silencieuse
-- pour tout attribut GEDCOM porteur d'une valeur (OCCU, EDUC, RELI, TITL...).
ALTER TABLE events ADD COLUMN value TEXT;
