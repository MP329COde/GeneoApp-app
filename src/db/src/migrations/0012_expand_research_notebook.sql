-- Carnet de recherche complet : objectif, archives consultées et résultat
-- d'une recherche ; priorité et échéance des tâches ; preuves rattachées à
-- une hypothèse (pour ou contre), éventuellement liées à une source.

ALTER TABLE research_notebook ADD COLUMN objective TEXT;
ALTER TABLE research_notebook ADD COLUMN archives TEXT;
ALTER TABLE research_notebook ADD COLUMN result TEXT;

ALTER TABLE research_tasks ADD COLUMN priority TEXT NOT NULL
  CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH')) DEFAULT 'MEDIUM';
ALTER TABLE research_tasks ADD COLUMN due_date TEXT;
ALTER TABLE research_tasks ADD COLUMN updated_at TEXT;
ALTER TABLE research_hypotheses ADD COLUMN updated_at TEXT;

CREATE TABLE research_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hypothesis_id INTEGER NOT NULL REFERENCES research_hypotheses(id),
  stance TEXT NOT NULL CHECK (stance IN ('SUPPORTS', 'CONTRADICTS', 'NEUTRAL')) DEFAULT 'SUPPORTS',
  source_id INTEGER REFERENCES sources(id),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT
);

CREATE INDEX idx_research_hypotheses_research ON research_hypotheses(research_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_research_tasks_research ON research_tasks(research_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_research_evidence_hypothesis ON research_evidence(hypothesis_id) WHERE deleted_at IS NULL;
