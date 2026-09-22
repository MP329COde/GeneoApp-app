export class StatisticsService {
  constructor(database) {
    this.database = database;
  }

  totals() {
    const tables = ['persons', 'places', 'events', 'unions', 'parentages', 'sources', 'media'];
    return Object.fromEntries(
      tables.map((table) => [
        table,
        this.database
          .prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE deleted_at IS NULL`)
          .get().count,
      ]),
    );
  }

  summary() {
    return { ...this.totals(), generatedAt: new Date().toISOString() };
  }
}
