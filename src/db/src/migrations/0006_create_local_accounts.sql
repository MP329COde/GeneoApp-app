-- Profils locaux : séparation simple des actions par profil, sans rôles ni
-- permissions fines. Le PIN est optionnel (profil "ouvert") ; lorsqu'il est
-- défini, il est stocké sous forme salée/hachée (scrypt), jamais en clair.

CREATE TABLE local_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  pin_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_login_at TEXT
);

CREATE UNIQUE INDEX idx_local_accounts_name ON local_accounts(name);
