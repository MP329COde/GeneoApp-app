-- `notifications.person_id` pointait vers une personne sans aucune clé
-- étrangère : rien ne garantissait que la personne désignée existe encore,
-- et rien ne garantissait non plus que la notification soit purgée avec elle.
-- La purge en cascade d'une personne (corbeille) supprimait ses fiches
-- dépendantes, mais laissait ses notifications pointer vers une ligne
-- disparue.
--
-- La clé étrangère est posée en « ON DELETE SET NULL » et non en cascade :
-- une notification est un message destiné à l'utilisateur, pas une donnée
-- derivative de la personne. La purge ne doit pas être bloquée par elle
-- (une notification ne peut pas empêcher de vider la corbeille), mais elle
-- ne doit pas non plus disparaître sans raison — elle perd simplement son
-- lien, l'utilisateur la voit encore, elle n'est plus rattachée à une fiche.
--
-- SQLite n'autorise pas l'ajout d'une clé étrangère par ALTER TABLE :
-- reconstruction de la table selon la procédure standard SQLite (créer,
-- copier, supprimer, renommer), en conservant les identifiants.

CREATE TABLE notifications_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL DEFAULT 'success',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  person_id INTEGER REFERENCES persons(id) ON DELETE SET NULL,
  dedupe_key TEXT
);

INSERT INTO notifications_new (id, type, title, message, read_at, created_at, person_id, dedupe_key)
SELECT id, type, title, message, read_at, created_at, person_id, dedupe_key FROM notifications;

DROP TABLE notifications;
ALTER TABLE notifications_new RENAME TO notifications;

CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC, id DESC);
CREATE INDEX idx_notifications_unread ON notifications(read_at, created_at DESC, id DESC);
CREATE UNIQUE INDEX idx_notifications_dedupe ON notifications(dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX idx_notifications_person ON notifications(person_id) WHERE person_id IS NOT NULL;
