import { withTransaction, recordAudit } from './base-repository.js';

function normalize(name) {
  return name.trim().toLowerCase();
}

export class PlaceRepository {
  constructor(database) {
    this.database = database;
  }

  create({ name, latitude = null, longitude = null }, { performedBy = null } = {}) {
    if (!name) {
      throw new Error('name est obligatoire');
    }
    const normalizedName = normalize(name);

    return withTransaction(this.database, () => {
      const info = this.database
        .prepare(
          `INSERT INTO places (name, normalized_name, latitude, longitude)
           VALUES (@name, @normalizedName, @latitude, @longitude)`,
        )
        .run({ name, normalizedName, latitude, longitude });

      const id = info.lastInsertRowid;
      recordAudit(this.database, {
        tableName: 'places',
        rowId: id,
        operation: 'INSERT',
        changes: { name, latitude, longitude },
        performedBy,
      });

      return this.findById(id);
    });
  }

  findById(id, { includeDeleted = false } = {}) {
    const clause = includeDeleted ? '' : 'AND deleted_at IS NULL';
    return this.database.prepare(`SELECT * FROM places WHERE id = ? ${clause}`).get(id) ?? null;
  }

  findByName(name, { includeDeleted = false } = {}) {
    const clause = includeDeleted ? '' : 'AND deleted_at IS NULL';
    return (
      this.database
        .prepare(`SELECT * FROM places WHERE normalized_name = ? ${clause}`)
        .get(normalize(name)) ?? null
    );
  }

  list({ includeDeleted = false } = {}) {
    const clause = includeDeleted ? '' : 'WHERE deleted_at IS NULL';
    return this.database.prepare(`SELECT * FROM places ${clause} ORDER BY name`).all();
  }

  softDelete(id, { performedBy = null } = {}) {
    return withTransaction(this.database, () => {
      const existing = this.findById(id);
      if (!existing) {
        throw new Error(`Lieu introuvable : ${id}`);
      }

      this.database
        .prepare(
          `UPDATE places SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ? AND deleted_at IS NULL`,
        )
        .run(id);

      recordAudit(this.database, {
        tableName: 'places',
        rowId: id,
        operation: 'DELETE',
        performedBy,
      });

      return true;
    });
  }

  restore(id, { performedBy = null } = {}) {
    return withTransaction(this.database, () => {
      const existing = this.findById(id, { includeDeleted: true });
      if (!existing || existing.deleted_at === null) {
        throw new Error(`Lieu non supprimé ou introuvable : ${id}`);
      }

      this.database
        .prepare(
          `UPDATE places SET deleted_at = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ?`,
        )
        .run(id);

      recordAudit(this.database, {
        tableName: 'places',
        rowId: id,
        operation: 'RESTORE',
        performedBy,
      });

      return this.findById(id);
    });
  }
}
