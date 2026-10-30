import { withTransaction, recordAudit } from './base-repository.js';
import { indexDocument, removeFromIndex } from './search-index.js';
import { personDocument } from './search-reindex.js';

const UPDATABLE_FIELDS = [
  'givenNames',
  'familyName',
  'birthFamilyName',
  'sex',
  'notes',
  'nickname',
  'alias',
  'marriedName',
  'title',
  'suffix',
  'isLiving',
  'isPrivate',
  'externalId',
];

const FIELD_TO_COLUMN = {
  givenNames: 'given_names',
  familyName: 'family_name',
  birthFamilyName: 'birth_family_name',
  sex: 'sex',
  notes: 'notes',
  nickname: 'nickname',
  alias: 'alias',
  marriedName: 'married_name',
  title: 'title',
  suffix: 'suffix',
  isLiving: 'is_living',
  isPrivate: 'is_private',
  externalId: 'external_id',
};

// Bornes de pagination de la liste des personnes : une page par défaut et une
// page maximale (au-delà, on force un COUNT sur toute la base).
export const PERSONS_PAGE_DEFAULT_LIMIT = 50;
export const PERSONS_PAGE_MAX_LIMIT = 200;

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
      alias = null,
      marriedName = null,
      title = null,
      suffix = null,
      isLiving = true,
      isPrivate = false,
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
             nickname, alias, married_name, title, suffix, is_living, is_private, external_id
           )
           VALUES (
             @givenNames, @familyName, @birthFamilyName, @sex, @notes,
             @nickname, @alias, @marriedName, @title, @suffix, @isLiving, @isPrivate, @externalId
           )`,
        )
        .run({
          givenNames,
          familyName,
          birthFamilyName,
          sex,
          notes,
          nickname,
          alias,
          marriedName,
          title,
          suffix,
          isLiving: isLiving ? 1 : 0,
          isPrivate: isPrivate ? 1 : 0,
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
          alias,
          marriedName,
          title,
          suffix,
          isLiving,
          isPrivate,
          externalId,
        },
        performedBy,
      });

      indexDocument(this.database, {
        entityType: 'PERSON',
        entityId: id,
        ...personDocument({
          given_names: givenNames,
          family_name: familyName,
          birth_family_name: birthFamilyName,
          married_name: marriedName,
          alias,
          nickname,
          notes,
        }),
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
  // filtre texte optionnel `q` (nom/prénom) — pour les grandes bases où
  // charger toute la liste d'un coup n'est plus raisonnable (listes de
  // plusieurs milliers de personnes).
  // `limit` et `offset` sont bornés ici aussi (défense en profondeur) : une
  // valeur absurde ne peut pas faire échouer la requête SQL.
  list({ includeDeleted = false, limit, offset = 0, q } = {}) {
    const whereClause = this.buildWhereClause({ includeDeleted, q });
    const params = this.buildFilterParams(q);

    if (limit === undefined) {
      return this.database
        .prepare(`SELECT * FROM persons ${whereClause} ORDER BY family_name, given_names, id`)
        .all(params);
    }

    const requestedLimit = Math.trunc(Number(limit));
    const safeLimit = Math.min(
      Number.isFinite(requestedLimit) && requestedLimit >= 1
        ? requestedLimit
        : PERSONS_PAGE_DEFAULT_LIMIT,
      PERSONS_PAGE_MAX_LIMIT,
    );
    const requestedOffset = Math.trunc(Number(offset));
    const safeOffset =
      Number.isFinite(requestedOffset) && requestedOffset > 0 ? requestedOffset : 0;
    const items = this.database
      .prepare(
        `SELECT * FROM persons ${whereClause}
         ORDER BY family_name, given_names, id
         LIMIT @limit OFFSET @offset`,
      )
      .all({ ...params, limit: safeLimit, offset: safeOffset });
    const { total } = this.database
      .prepare(`SELECT COUNT(*) AS total FROM persons ${whereClause}`)
      .get(params);
    return { items, total };
  }

  // Compte les personnes correspondant au même filtre que `list`, sans charger
  // les lignes : sert aux réponses « total uniquement » de la pagination.
  count({ includeDeleted = false, q } = {}) {
    const whereClause = this.buildWhereClause({ includeDeleted, q });
    const { total } = this.database
      .prepare(`SELECT COUNT(*) AS total FROM persons ${whereClause}`)
      .get(this.buildFilterParams(q));
    return total;
  }

  buildWhereClause({ includeDeleted = false, q } = {}) {
    const conditions = [includeDeleted ? '' : 'deleted_at IS NULL'].filter(Boolean);
    if (q && q.trim()) {
      conditions.push(`(given_names || ' ' || family_name) LIKE @q ESCAPE '\\'`);
    }
    return conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  }

  buildFilterParams(q) {
    if (!q || !q.trim()) return {};
    const escaped = q.trim().replace(/[\\%_]/g, (match) => `\\${match}`);
    return { q: `%${escaped}%` };
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
            ['isLiving', 'isPrivate'].includes(field) ? (patch[field] ? 1 : 0) : patch[field],
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
        ...personDocument(updated),
      });

      return updated;
    });
  }

  /** Identifiants externes de la personne (FamilySearch, Geneanet…). */
  listIdentifiers(personId) {
    return this.database
      .prepare(
        `SELECT id, person_id AS personId, scheme, value
         FROM person_identifiers
         WHERE person_id = ? AND deleted_at IS NULL
         ORDER BY scheme, value`,
      )
      .all(personId);
  }

  /**
   * Ajoute un identifiant externe. Le schéma est normalisé en majuscules ;
   * ajouter deux fois le même couple (schéma, valeur) est sans effet et
   * renvoie l'identifiant existant.
   */
  addIdentifier(personId, { scheme, value }, { performedBy = null } = {}) {
    const normalizedScheme = String(scheme ?? '')
      .trim()
      .toUpperCase();
    const normalizedValue = String(value ?? '').trim();
    if (!normalizedScheme || !normalizedValue) {
      throw new Error('scheme et value sont obligatoires');
    }

    return withTransaction(this.database, () => {
      if (!this.findById(personId)) {
        throw new Error(`Personne introuvable : ${personId}`);
      }
      const existing = this.database
        .prepare(
          `SELECT id FROM person_identifiers
           WHERE person_id = ? AND scheme = ? AND value = ? AND deleted_at IS NULL`,
        )
        .get(personId, normalizedScheme, normalizedValue);
      if (existing)
        return { id: existing.id, personId, scheme: normalizedScheme, value: normalizedValue };

      const info = this.database
        .prepare('INSERT INTO person_identifiers (person_id, scheme, value) VALUES (?, ?, ?)')
        .run(personId, normalizedScheme, normalizedValue);
      recordAudit(this.database, {
        tableName: 'person_identifiers',
        rowId: info.lastInsertRowid,
        operation: 'INSERT',
        changes: { personId, scheme: normalizedScheme, value: normalizedValue },
        performedBy,
      });
      return {
        id: info.lastInsertRowid,
        personId,
        scheme: normalizedScheme,
        value: normalizedValue,
      };
    });
  }

  removeIdentifier(personId, identifierId, { performedBy = null } = {}) {
    return withTransaction(this.database, () => {
      const result = this.database
        .prepare(
          `UPDATE person_identifiers
           SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
               updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ? AND person_id = ? AND deleted_at IS NULL`,
        )
        .run(identifierId, personId);
      if (result.changes === 0) return false;
      recordAudit(this.database, {
        tableName: 'person_identifiers',
        rowId: identifierId,
        operation: 'DELETE',
        performedBy,
      });
      return true;
    });
  }

  /**
   * Personnes portant un identifiant externe donné. Plusieurs résultats
   * signalent un doublon probable : c'est une information, jamais une
   * fusion automatique.
   */
  findByIdentifier(scheme, value) {
    return this.database
      .prepare(
        `SELECT p.* FROM persons p
         JOIN person_identifiers i ON i.person_id = p.id AND i.deleted_at IS NULL
         WHERE i.scheme = ? AND i.value = ? AND p.deleted_at IS NULL
         ORDER BY p.id`,
      )
      .all(String(scheme).trim().toUpperCase(), String(value).trim());
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

      // L'index de recherche locale doit suivre la corbeille : une personne
      // supprimée ne doit plus remonter dans les résultats de recherche.
      removeFromIndex(this.database, { entityType: 'PERSON', entityId: id });

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

      // La personne having été retirée de l'index à sa suppression, elle doit
      // y revenir : sinon elle resterait introuvable après restauration.
      indexDocument(this.database, {
        entityType: 'PERSON',
        entityId: id,
        ...personDocument(existing),
      });

      return this.findById(id);
    });
  }
}
