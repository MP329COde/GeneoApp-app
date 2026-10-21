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

  updateCoordinates(id, { latitude, longitude }, { performedBy = null } = {}) {
    return withTransaction(this.database, () => {
      const existing = this.findById(id);
      if (!existing) {
        throw new Error(`Lieu introuvable : ${id}`);
      }

      this.database
        .prepare(
          `UPDATE places SET latitude = ?, longitude = ?,
                             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ? AND deleted_at IS NULL`,
        )
        .run(latitude, longitude, id);

      recordAudit(this.database, {
        tableName: 'places',
        rowId: id,
        operation: 'UPDATE',
        changes: { latitude, longitude },
        performedBy,
      });

      return this.findById(id);
    });
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

      // Un lieu ne peut exister qu'une seule fois (`normalized_name` est
      // unique parmi les lieux actifs). Si le même lieu a été recréé entre
      // la suppression et la restauration, la réactivation échouerait sur
      // cette contrainte — et la fiche resterait bloquée en corbeille, sans
      // moyen de la récupérer. On fusionne alors les deux fiches : les
      // données rattachées au lieu supprimé (événements, médias) sont
      // reconduites sur le lieu déjà actif, et la ligne en corbeille disparaît.
      const duplicate = this.database
        .prepare(
          `SELECT * FROM places
           WHERE normalized_name = ? AND id != ? AND deleted_at IS NULL`,
        )
        .get(existing.normalized_name, id);

      if (duplicate) {
        this.#mergeInto(existing, duplicate, performedBy);
        return this.findById(duplicate.id);
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

  /**
   * Fusionne un lieu supprimé dans un lieu actif de même nom : les
   * événements et médias qui pointaient vers le lieu supprimé sont
   * reconduits, les coordonnées manquantes sont complétées, et la ligne
   * supprimée est définitivement effacée.
   */
  #mergeInto(deleted, kept, performedBy) {
    this.database
      .prepare('UPDATE events SET place_id = ? WHERE place_id = ?')
      .run(kept.id, deleted.id);
    this.database
      .prepare('UPDATE media SET place_id = ? WHERE place_id = ?')
      .run(kept.id, deleted.id);

    // Les coordonnées du lieu supprimé complètent celles du lieu actif si
    // elles manquent : la purge n'a rien perdu, et la carte gagne un point.
    this.database
      .prepare(
        `UPDATE places
         SET latitude = COALESCE(latitude, @latitude),
             longitude = COALESCE(longitude, @longitude),
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = @id`,
      )
      .run({
        id: kept.id,
        latitude: deleted.latitude,
        longitude: deleted.longitude,
      });

    this.database.prepare('DELETE FROM places WHERE id = ?').run(deleted.id);

    recordAudit(this.database, {
      tableName: 'places',
      rowId: kept.id,
      operation: 'MERGE',
      changes: { mergedFrom: deleted.id, name: kept.name },
      performedBy,
    });
  }
}
