-- Faille (audit 2026-09) : l'unicité du nom de profil était sensible à la
-- casse (BINARY par défaut). Un profil "Bob" protégé par un code pouvait
-- ainsi être doublé par un profil "bob"/"BOB" sans code, contournant de
-- fait la protection par PIN pour cette identité (les deux profils donnent
-- accès aux mêmes actions/données locales). L'index est recréé en
-- comparaison insensible à la casse pour empêcher ce doublon.
DROP INDEX IF EXISTS idx_local_accounts_name;
CREATE UNIQUE INDEX idx_local_accounts_name ON local_accounts(name COLLATE NOCASE);
