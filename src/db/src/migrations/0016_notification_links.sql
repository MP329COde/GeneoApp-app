-- Notifications de vérification : lien vers une personne et clé anti-doublon.
ALTER TABLE notifications ADD COLUMN person_id INTEGER;
ALTER TABLE notifications ADD COLUMN dedupe_key TEXT;

CREATE UNIQUE INDEX idx_notifications_dedupe ON notifications(dedupe_key) WHERE dedupe_key IS NOT NULL;
