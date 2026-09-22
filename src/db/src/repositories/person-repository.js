import { withTransaction, recordAudit } from './base-repository.js';

const UPDATABLE_FIELDS = ['givenNames', 'familyName', 'birthFamilyName', 'sex', 'notes'];

const FIELD_TO_COLUMN = {
  givenNames: 'given_names',
  familyName: 'family_name',
  birthFamilyName: 'birth_family_name',
  sex: 'sex',
  notes: 'notes',
};

export class PersonRepository {
  constructor(database) {
    this.database = database;
  }

  create(
    { givenNames, familyName, birthFamilyName = null, sex = 'U', notes = null },
    { performedBy = null } = {},
  ) {
    if (!givenNames || !familyName) {
      throw new Error('givenNames et familyName sont obligatoires');
    }

    return withTransaction(this.database, () => {
      const info = this.database
        .prepare(
          `INSERT INTO persons (given_names, family_name, birth_family_name, sex, notes)
           VALUES (@givenNames, @familyName, @birthFamilyName, @sex, @notes)`,
        )
        .run({ givenNames, familyName, birthFamilyName, sex, notes });

      const id = info.lastInsertRowid;
      recordAudit(this.database, {
        tableName: 'persons',
        rowId: id,
        operation: 'INSERT',
        changes: { givenNames, familyName, birthFamilyName, sex, notes },
        performedBy,
      });

      return this.findById(id);
    });
  }

  findById(id, { includeDeleted = false } = {}) {
    const clause = includeDeleted ? '' : 'AND deleted_at IS NULL';
    return this.database.prepare(`SELECT * FROM persons WHERE id = ? ${clause}`).get(id) ?? null;
  }

  list({ includeDeleted = false } = {}) {
    const clause = includeDeleted ? '' : 'WHERE deleted_at IS NULL';
    return this.database
      .prepare(`SELECT * FROM persons ${clause} ORDER BY family_name, given_names`)
      .all();
  }

  update(id, patch, { performedBy = null } = {}) {
    const fields = Object.keys(patch).filter((key) => UPDATABLE_FIELDS.includes(key));
    if (fields.length === 0) {
      throw new Error('Aucun champ modifiable fourni');
    }

    return withTransaction(this.database, () => {
      const existing = this.findById(id);
      if (!existing) {
        throw new Error(`Personne introuvable : ${id}`);
      }

      const assignments = fields.map((field) => `${FIELD_TO_COLUMN[field]} = @${field}`).join(', ');
      const params = { id, ...Object.fromEntries(fields.map((field) => [field, patch[field]])) };

      this.database
        .prepare(
          `UPDATE persons SET ${assignments}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = @id AND deleted_at IS NULL`,
        )
        .run(params);

      recordAudit(this.database, {
        tableName: 'persons',
        rowId: id,
        operation: 'UPDATE',
        changes: Object.fromEntries(fields.map((field) => [field, patch[field]])),
        performedBy,
      });

      return this.findById(id);
    });
  }

  softDelete(id, { performedBy = null } = {}) {
    return withTransaction(this.database, () => {
      const existing = this.findById(id);
      if (!existing) {
        throw new Error(`Personne introuvable : ${id}`);
      }

      this.database
        .prepare(
          `UPDATE persons SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ? AND deleted_at IS NULL`,
        )
        .run(id);

      recordAudit(this.database, {
        tableName: 'persons',
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
        throw new Error(`Personne non supprimée ou introuvable : ${id}`);
      }

      this.database
        .prepare(
          `UPDATE persons SET deleted_at = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ?`,
        )
        .run(id);

      recordAudit(this.database, {
        tableName: 'persons',
        rowId: id,
        operation: 'RESTORE',
        performedBy,
      });

      return this.findById(id);
    });
  }
}
