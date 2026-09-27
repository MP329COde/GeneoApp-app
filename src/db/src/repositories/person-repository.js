import { withTransaction, recordAudit } from './base-repository.js';
import { indexDocument } from './search-index.js';

const UPDATABLE_FIELDS = [
  'givenNames',
  'familyName',
  'birthFamilyName',
  'sex',
  'notes',
  'nickname',
  'marriedName',
  'title',
  'suffix',
  'isLiving',
  'externalId',
];

const FIELD_TO_COLUMN = {
  givenNames: 'given_names',
  familyName: 'family_name',
  birthFamilyName: 'birth_family_name',
  sex: 'sex',
  notes: 'notes',
  nickname: 'nickname',
  marriedName: 'married_name',
  title: 'title',
  suffix: 'suffix',
  isLiving: 'is_living',
  externalId: 'external_id',
};

export class PersonRepository {
  constructor(database) {
    this.database = database;
  }

  create(
    {
      givenNames = '',
      familyName = '',
      birthFamilyName = null,
      sex = 'U',
      notes = null,
      nickname = null,
      marriedName = null,
      title = null,
      suffix = null,
      isLiving = true,
      externalId = null,
    },
    { performedBy = null } = {},
  ) {
    // Un prénom OU un nom suffit (voir validation/schemas.js côté API) :
    // seule l'absence totale des deux est refusée.
    if (!givenNames?.trim() && !familyName?.trim()) {
      throw new Error('givenNames ou familyName doit être renseigné');
    }

    return withTransaction(this.database, () => {
      const info = this.database
        .prepare(
          `INSERT INTO persons (
             given_names, family_name, birth_family_name, sex, notes,
             nickname, married_name, title, suffix, is_living, external_id
           )
           VALUES (
             @givenNames, @familyName, @birthFamilyName, @sex, @notes,
             @nickname, @marriedName, @title, @suffix, @isLiving, @externalId
           )`,
        )
        .run({
          givenNames,
          familyName,
          birthFamilyName,
          sex,
          notes,
          nickname,
          marriedName,
          title,
          suffix,
          isLiving: isLiving ? 1 : 0,
          externalId,
        });

      const id = info.lastInsertRowid;
      recordAudit(this.database, {
        tableName: 'persons',
        rowId: id,
        operation: 'INSERT',
        changes: {
          givenNames,
          familyName,
          birthFamilyName,
          sex,
          notes,
          nickname,
          marriedName,
          title,
          suffix,
          isLiving,
          externalId,
        },
        performedBy,
      });

      indexDocument(this.database, {
        entityType: 'PERSON',
        entityId: id,
        title: `${givenNames} ${familyName}`,
        body: [birthFamilyName, nickname, notes].filter(Boolean).join(' — '),
      });

      return this.findById(id);
    });
  }

  findById(id, { includeDeleted = false } = {}) {
    const clause = includeDeleted ? '' : 'AND deleted_at IS NULL';
    return this.database.prepare(`SELECT * FROM persons WHERE id = ? ${clause}`).get(id) ?? null;
  }

  // Sans `limit`, renvoie la liste complète (comportement historique, utilisé
  // partout côté client pour les calculs locaux — tri, filtrage, doublons…).
  // Avec `limit`, active la pagination côté API : `{ items, total }`, avec un
  // filtre texte optionnel `q` (nom/prénom, insensible à la casse et aux
  // accents) — pour les grandes bases où charger toute la liste d'un coup
  // n'est plus raisonnable (listes de plusieurs milliers de personnes).
  list({ includeDeleted = false, limit, offset = 0, q } = {}) {
    const deletedClause = includeDeleted ? '' : 'deleted_at IS NULL';
    const conditions = [deletedClause].filter(Boolean);
    const params = {};
    if (q && q.trim()) {
      conditions.push(`(given_names || ' ' || family_name) LIKE @q ESCAPE '\\'`);
      const escaped = q.trim().replace(/[\\%_]/g, (match) => `\\${match}`);
      params.q = `%${escaped}%`;
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    if (limit === undefined) {
      return this.database
        .prepare(`SELECT * FROM persons ${whereClause} ORDER BY family_name, given_names`)
        .all(params);
    }

    const items = this.database
      .prepare(
        `SELECT * FROM persons ${whereClause}
         ORDER BY family_name, given_names
         LIMIT @limit OFFSET @offset`,
      )
      .all({ ...params, limit, offset });
    const { total } = this.database
      .prepare(`SELECT COUNT(*) AS total FROM persons ${whereClause}`)
      .get(params);
    return { items, total };
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
      const params = {
        id,
        ...Object.fromEntries(
          fields.map((field) => [
            field,
            field === 'isLiving' ? (patch[field] ? 1 : 0) : patch[field],
          ]),
        ),
      };

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

      const updated = this.findById(id);
      indexDocument(this.database, {
        entityType: 'PERSON',
        entityId: id,
        title: `${updated.given_names} ${updated.family_name}`,
        body: [updated.birth_family_name, updated.nickname, updated.notes]
          .filter(Boolean)
          .join(' — '),
      });

      return updated;
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
