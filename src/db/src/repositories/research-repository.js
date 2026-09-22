import { withTransaction, recordAudit } from './base-repository.js';

export class ResearchRepository {
  constructor(database) {
    this.database = database;
  }

  create(
    { title, content, personId = null, status = 'TODO', priority = 'MEDIUM', dueDate = null },
    { performedBy = null } = {},
  ) {
    return withTransaction(this.database, () => {
      const result = this.database
        .prepare(
          `INSERT INTO research_notebook (title, content, person_id, status, priority, due_date)
           VALUES (@title, @content, @personId, @status, @priority, @dueDate)`,
        )
        .run({ title, content, personId, status, priority, dueDate });
      recordAudit(this.database, {
        tableName: 'research_notebook',
        rowId: result.lastInsertRowid,
        operation: 'INSERT',
        changes: { title, personId, status, priority },
        performedBy,
      });
      return this.findById(result.lastInsertRowid);
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
      .prepare('SELECT * FROM research_notebook WHERE deleted_at IS NULL ORDER BY id DESC')
      .all();
  }
}
