import { withTransaction, recordAudit, NOW_EXPRESSION } from './base-repository.js';

// Colonnes modifiables par table, dans l'ordre camelCase → snake_case.
const RESEARCH_FIELDS = {
  title: 'title',
  content: 'content',
  personId: 'person_id',
  status: 'status',
  priority: 'priority',
  dueDate: 'due_date',
  objective: 'objective',
  archives: 'archives',
  result: 'result',
};
const HYPOTHESIS_FIELDS = { title: 'title', content: 'content', status: 'status' };
const TASK_FIELDS = {
  title: 'title',
  content: 'content',
  status: 'status',
  priority: 'priority',
  dueDate: 'due_date',
};

export class ResearchRepository {
  constructor(database) {
    this.database = database;
  }

  create(
    {
      title,
      content,
      personId = null,
      status = 'TODO',
      priority = 'MEDIUM',
      dueDate = null,
      objective = null,
      archives = null,
      result = null,
    },
    { performedBy = null } = {},
  ) {
    return withTransaction(this.database, () => {
      const inserted = this.database
        .prepare(
          `INSERT INTO research_notebook
             (title, content, person_id, status, priority, due_date, objective, archives, result)
           VALUES (@title, @content, @personId, @status, @priority, @dueDate, @objective, @archives, @result)`,
        )
        .run({ title, content, personId, status, priority, dueDate, objective, archives, result });
      recordAudit(this.database, {
        tableName: 'research_notebook',
        rowId: inserted.lastInsertRowid,
        operation: 'INSERT',
        changes: { title, personId, status, priority },
        performedBy,
      });
      return this.findById(inserted.lastInsertRowid);
    });
  }

  findById(id) {
    return (
      this.database
        .prepare('SELECT * FROM research_notebook WHERE id = ? AND deleted_at IS NULL')
        .get(id) ?? null
    );
  }

  list() {
    return this.database
      .prepare(
        `SELECT r.*,
           (SELECT COUNT(*) FROM research_tasks t
              WHERE t.research_id = r.id AND t.deleted_at IS NULL) AS task_count,
           (SELECT COUNT(*) FROM research_tasks t
              WHERE t.research_id = r.id AND t.deleted_at IS NULL AND t.status = 'DONE') AS done_task_count,
           (SELECT COUNT(*) FROM research_hypotheses h
              WHERE h.research_id = r.id AND h.deleted_at IS NULL) AS hypothesis_count
         FROM research_notebook r
         WHERE r.deleted_at IS NULL
         ORDER BY r.id DESC`,
      )
      .all();
  }

  /** Recherche complète : hypothèses (avec leurs preuves) et tâches. */
  findDetailed(id) {
    const research = this.findById(id);
    if (!research) return null;
    const hypotheses = this.database
      .prepare(
        'SELECT * FROM research_hypotheses WHERE research_id = ? AND deleted_at IS NULL ORDER BY id',
      )
      .all(id);
    const evidence = this.database
      .prepare(
        `SELECT e.*, s.title AS source_title
         FROM research_evidence e
         JOIN research_hypotheses h ON h.id = e.hypothesis_id
         LEFT JOIN sources s ON s.id = e.source_id
         WHERE h.research_id = ? AND e.deleted_at IS NULL
         ORDER BY e.id`,
      )
      .all(id);
    const tasks = this.database
      .prepare(
        `SELECT * FROM research_tasks WHERE research_id = ? AND deleted_at IS NULL
         ORDER BY CASE status WHEN 'DONE' THEN 1 WHEN 'ABANDONED' THEN 2 ELSE 0 END,
                  CASE priority WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END,
                  due_date IS NULL, due_date, id`,
      )
      .all(id);
    return {
      ...research,
      hypotheses: hypotheses.map((hypothesis) => ({
        ...hypothesis,
        evidence: evidence.filter((item) => item.hypothesis_id === hypothesis.id),
      })),
      tasks,
    };
  }

  patchRow(table, fields, id, patch, performedBy, { touchUpdatedAt = true } = {}) {
    const entries = Object.entries(fields).filter(([key]) => patch[key] !== undefined);
    if (entries.length === 0) return;
    const assignments = entries.map(([key, column]) => `${column} = @${key}`);
    if (touchUpdatedAt) assignments.push(`updated_at = ${NOW_EXPRESSION}`);
    this.database
      .prepare(
        `UPDATE ${table} SET ${assignments.join(', ')} WHERE id = @id AND deleted_at IS NULL`,
      )
      .run({ ...Object.fromEntries(entries.map(([key]) => [key, patch[key]])), id });
    recordAudit(this.database, {
      tableName: table,
      rowId: id,
      operation: 'UPDATE',
      changes: Object.fromEntries(entries.map(([key]) => [key, patch[key]])),
      performedBy,
    });
  }

  update(id, patch, { performedBy = null } = {}) {
    return withTransaction(this.database, () => {
      this.patchRow('research_notebook', RESEARCH_FIELDS, id, patch, performedBy);
      return this.findDetailed(id);
    });
  }

  softDelete(table, id, performedBy) {
    const result = this.database
      .prepare(
        `UPDATE ${table} SET deleted_at = ${NOW_EXPRESSION} WHERE id = ? AND deleted_at IS NULL`,
      )
      .run(id);
    if (result.changes === 0) return false;
    recordAudit(this.database, { tableName: table, rowId: id, operation: 'DELETE', performedBy });
    return true;
  }

  remove(id, { performedBy = null } = {}) {
    return withTransaction(this.database, () =>
      this.softDelete('research_notebook', id, performedBy),
    );
  }

  addHypothesis(researchId, { title, content = '', status = 'OPEN' }, { performedBy = null } = {}) {
    return withTransaction(this.database, () => {
      const inserted = this.database
        .prepare(
          `INSERT INTO research_hypotheses (research_id, title, content, status)
           VALUES (?, ?, ?, ?)`,
        )
        .run(researchId, title, content, status);
      recordAudit(this.database, {
        tableName: 'research_hypotheses',
        rowId: inserted.lastInsertRowid,
        operation: 'INSERT',
        changes: { researchId, title, status },
        performedBy,
      });
      return this.findHypothesis(inserted.lastInsertRowid);
    });
  }

  findHypothesis(id) {
    return (
      this.database
        .prepare('SELECT * FROM research_hypotheses WHERE id = ? AND deleted_at IS NULL')
        .get(id) ?? null
    );
  }

  updateHypothesis(id, patch, { performedBy = null } = {}) {
    return withTransaction(this.database, () => {
      this.patchRow('research_hypotheses', HYPOTHESIS_FIELDS, id, patch, performedBy);
      return this.findHypothesis(id);
    });
  }

  removeHypothesis(id, { performedBy = null } = {}) {
    return withTransaction(this.database, () =>
      this.softDelete('research_hypotheses', id, performedBy),
    );
  }

  addEvidence(
    hypothesisId,
    { stance = 'SUPPORTS', sourceId = null, content },
    { performedBy = null } = {},
  ) {
    return withTransaction(this.database, () => {
      const inserted = this.database
        .prepare(
          `INSERT INTO research_evidence (hypothesis_id, stance, source_id, content)
           VALUES (?, ?, ?, ?)`,
        )
        .run(hypothesisId, stance, sourceId, content);
      recordAudit(this.database, {
        tableName: 'research_evidence',
        rowId: inserted.lastInsertRowid,
        operation: 'INSERT',
        changes: { hypothesisId, stance, sourceId },
        performedBy,
      });
      return this.database
        .prepare('SELECT * FROM research_evidence WHERE id = ?')
        .get(inserted.lastInsertRowid);
    });
  }

  removeEvidence(id, { performedBy = null } = {}) {
    return withTransaction(this.database, () =>
      this.softDelete('research_evidence', id, performedBy),
    );
  }

  addTask(
    researchId,
    { title, content = null, status = 'TODO', priority = 'MEDIUM', dueDate = null },
    { performedBy = null } = {},
  ) {
    return withTransaction(this.database, () => {
      const inserted = this.database
        .prepare(
          `INSERT INTO research_tasks (research_id, title, content, status, priority, due_date)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(researchId, title, content, status, priority, dueDate);
      recordAudit(this.database, {
        tableName: 'research_tasks',
        rowId: inserted.lastInsertRowid,
        operation: 'INSERT',
        changes: { researchId, title, status, priority, dueDate },
        performedBy,
      });
      return this.findTask(inserted.lastInsertRowid);
    });
  }

  findTask(id) {
    return (
      this.database
        .prepare('SELECT * FROM research_tasks WHERE id = ? AND deleted_at IS NULL')
        .get(id) ?? null
    );
  }

  updateTask(id, patch, { performedBy = null } = {}) {
    return withTransaction(this.database, () => {
      this.patchRow('research_tasks', TASK_FIELDS, id, patch, performedBy);
      return this.findTask(id);
    });
  }

  removeTask(id, { performedBy = null } = {}) {
    return withTransaction(this.database, () => this.softDelete('research_tasks', id, performedBy));
  }
}
