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

  /**
   * Supprime les entrées de journal antérieures à une date donnée.
   *
   * Le journal d'audit est append-only par nature : il ne se purge pas
   * tout seul, car une trace de modification est une information que
   * l'utilisateur peut avoir besoin de consulter. Mais il croît sans
   * limite (une écriture journalisée par mutation), et une base très
   * active finit par peser plusieurs dizaines de mégaoctets. La purge est
   * donc proposée explicitement, sur une période que l'utilisateur choisit.
   *
   * Renvoie le nombre d'entrées supprimées.
   */
  purgeBefore(cutoffIsoDate) {
    const result = this.database
      .prepare('DELETE FROM audit_log WHERE performed_at < ?')
      .run(cutoffIsoDate);
    return result.changes;
  }

  count() {
    return this.database.prepare('SELECT COUNT(*) AS count FROM audit_log').get().count;
  }
}
