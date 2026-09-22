export class AuditRepository {
  constructor(database) {
    this.database = database;
  }

  findForEntity(tableName, rowId) {
    return this.database
      .prepare(
        `SELECT * FROM audit_log WHERE table_name = ? AND row_id = ? ORDER BY performed_at, id`,
      )
      .all(tableName, rowId);
  }
}
