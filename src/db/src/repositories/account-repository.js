import { withTransaction, recordAudit } from './base-repository.js';

export class AccountRepository {
  constructor(database) {
    this.database = database;
  }

  create({ name, pinHash = null }, { performedBy = null } = {}) {
    if (!name) {
      throw new Error('name est obligatoire');
    }

    return withTransaction(this.database, () => {
      const info = this.database
        .prepare(`INSERT INTO local_accounts (name, pin_hash) VALUES (@name, @pinHash)`)
        .run({ name, pinHash });

      const id = info.lastInsertRowid;
      recordAudit(this.database, {
        tableName: 'accounts',
        rowId: id,
        operation: 'INSERT',
        changes: { name, hasPin: pinHash !== null },
        performedBy,
      });

      return this.findById(id);
    });
  }

  findById(id) {
    return this.database.prepare(`SELECT * FROM local_accounts WHERE id = ?`).get(id) ?? null;
  }

  findByName(name) {
    // Comparaison insensible à la casse (voir migration 0019) : empêche de
    // créer un doublon "bob" pour contourner le PIN d'un profil "Bob".
    return (
      this.database
        .prepare(`SELECT * FROM local_accounts WHERE name = ? COLLATE NOCASE`)
        .get(name) ?? null
    );
  }

  list() {
    return this.database.prepare(`SELECT * FROM local_accounts ORDER BY name`).all();
  }

  touchLogin(id) {
    this.database
      .prepare(
        `UPDATE local_accounts SET last_login_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
      )
      .run(id);
  }

  remove(id, { performedBy = null } = {}) {
    return withTransaction(this.database, () => {
      const existing = this.findById(id);
      if (!existing) {
        throw new Error(`Profil introuvable : ${id}`);
      }

      this.database.prepare(`DELETE FROM local_accounts WHERE id = ?`).run(id);

      recordAudit(this.database, {
        tableName: 'accounts',
        rowId: id,
        operation: 'DELETE',
        performedBy,
      });

      return true;
    });
  }
}
