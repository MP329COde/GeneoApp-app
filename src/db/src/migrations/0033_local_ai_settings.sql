-- Réglages de l'IA locale (fournisseur, adresse, modèle).
--
-- Une seule ligne, propre à la machine : l'IA reste désactivée tant que
-- l'utilisateur ne l'active pas explicitement (ADR 0010). Ces réglages ne
-- sont ni annulables ni sauvegardés (configuration locale, comme l'indexation).
CREATE TABLE local_ai_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  provider TEXT NOT NULL DEFAULT 'OLLAMA' CHECK (provider IN ('OLLAMA', 'OPENAI_COMPATIBLE')),
  endpoint TEXT NOT NULL DEFAULT 'http://127.0.0.1:11434',
  model TEXT NOT NULL DEFAULT ''
);
INSERT INTO local_ai_settings (id) VALUES (1);
