import { withTransaction, recordAudit } from '../../../db/src/repositories/base-repository.js';
import { NotFoundError, ValidationError } from '../errors.js';
import { assertId } from '../validation/schemas.js';

// Fusionne deux fiches personne identifiées comme doublons potentiels
// (`SearchService#potentialDuplicates`). La personne "survivor" conserve son
// identité ; toute donnée réelle portée par "duplicate" (filiations, unions,
// participations à un événement, citations, notes, médias) est réattribuée
// avant que la fiche du doublon ne soit supprimée en douceur (jamais une
// suppression définitive) — l'historique reste intact via la corbeille et le
// journal d'audit, comme toute autre suppression de l'application.
//
// Les tables de jonction (parentages, union_partners, event_participants)
// portent des contraintes d'unicité (ex. un enfant ne peut avoir deux fois le
// même parent) : quand la réattribution créerait un doublon de lien, le lien
// du doublon est supprimé en douceur plutôt que réattribué, pour ne jamais
// violer ces contraintes ni créer de données incohérentes.
export class MergeService {
  constructor(database) {
    this.database = database;
  }

  previewPersons(survivorId, duplicateId) {
    assertId(survivorId, 'survivorId');
    assertId(duplicateId, 'duplicateId');
    if (survivorId === duplicateId) {
      throw new ValidationError('survivorId et duplicateId doivent être différents');
    }
    const survivor = this.#findPerson(survivorId);
    const duplicate = this.#findPerson(duplicateId);
    return {
      survivor,
      duplicate,
      reassignments: {
        parentagesAsParent: this.#count('parentages', 'parent_id', duplicateId),
        parentagesAsChild: this.#count('parentages', 'child_id', duplicateId),
        unionPartnerships: this.#count('union_partners', 'person_id', duplicateId),
        eventParticipations: this.#count('event_participants', 'person_id', duplicateId),
        citations: this.#countEntity('citations', duplicateId),
        notes: this.#countEntity('notes', duplicateId),
        media: this.#countEntity('media', duplicateId),
      },
    };
  }

  mergePersons(survivorId, duplicateId, { performedBy = null } = {}) {
    assertId(survivorId, 'survivorId');
    assertId(duplicateId, 'duplicateId');
    if (survivorId === duplicateId) {
      throw new ValidationError('survivorId et duplicateId doivent être différents');
    }
    this.#findPerson(survivorId);
    this.#findPerson(duplicateId);

    return withTransaction(this.database, () => {
      this.#reassignJunction({
        table: 'parentages',
        ownColumn: 'parent_id',
        matchColumns: ['child_id'],
        survivorId,
        duplicateId,
      });
      this.#reassignJunction({
        table: 'parentages',
        ownColumn: 'child_id',
        matchColumns: ['parent_id'],
        survivorId,
        duplicateId,
      });
      this.#reassignJunction({
        table: 'union_partners',
        ownColumn: 'person_id',
        matchColumns: ['union_id'],
        survivorId,
        duplicateId,
      });
      this.#reassignJunction({
        table: 'event_participants',
        ownColumn: 'person_id',
        matchColumns: ['event_id', 'role'],
        survivorId,
        duplicateId,
      });

      this.#reassignPolymorphic('citations', survivorId, duplicateId);
      this.#reassignPolymorphic('notes', survivorId, duplicateId);
      this.#reassignPolymorphic('media', survivorId, duplicateId);

      this.database
        .prepare(
          `UPDATE persons SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ? AND deleted_at IS NULL`,
        )
        .run(duplicateId);

      recordAudit(this.database, {
        tableName: 'persons',
        rowId: survivorId,
        operation: 'MERGE',
        changes: { survivorId, duplicateId },
        performedBy,
      });
      recordAudit(this.database, {
        tableName: 'persons',
        rowId: duplicateId,
        operation: 'DELETE',
        changes: { mergedInto: survivorId },
        performedBy,
      });

      return this.#findPerson(survivorId);
    });
  }

  #findPerson(id) {
    const person = this.database
      .prepare('SELECT * FROM persons WHERE id = ? AND deleted_at IS NULL')
      .get(id);
    if (!person) throw new NotFoundError(`Personne introuvable : ${id}`);
    return person;
  }

  #count(table, column, personId) {
    const row = this.database
      .prepare(`SELECT COUNT(*) AS total FROM ${table} WHERE ${column} = ? AND deleted_at IS NULL`)
      .get(personId);
    return row.total;
  }

  #countEntity(table, personId) {
    const row = this.database
      .prepare(
        `SELECT COUNT(*) AS total FROM ${table}
         WHERE entity_type = 'PERSON' AND entity_id = ? AND deleted_at IS NULL`,
      )
      .get(personId);
    return row.total;
  }

  // Réattribue les liens du doublon (`ownColumn = duplicateId`) au survivant,
  // sauf quand un lien équivalent existe déjà pour le survivant sur les
  // mêmes `matchColumns` — auquel cas le lien du doublon est simplement
  // supprimé en douceur pour ne pas violer la contrainte d'unicité.
  #reassignJunction({ table, ownColumn, matchColumns, survivorId, duplicateId }) {
    const rows = this.database
      .prepare(
        `SELECT id, ${matchColumns.join(', ')} FROM ${table} WHERE ${ownColumn} = ? AND deleted_at IS NULL`,
      )
      .all(duplicateId);

    for (const row of rows) {
      const matchClause = matchColumns.map((column) => `${column} = @${column}`).join(' AND ');
      const conflict = this.database
        .prepare(
          `SELECT id FROM ${table}
           WHERE ${ownColumn} = @survivorId AND ${matchClause} AND deleted_at IS NULL`,
        )
        .get({ survivorId, ...row });

      if (conflict) {
        this.database
          .prepare(
            `UPDATE ${table} SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                                 updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE id = ?`,
          )
          .run(row.id);
      } else {
        this.database
          .prepare(
            `UPDATE ${table} SET ${ownColumn} = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE id = ?`,
          )
          .run(survivorId, row.id);
      }
    }
  }

  #reassignPolymorphic(table, survivorId, duplicateId) {
    this.database
      .prepare(
        `UPDATE ${table} SET entity_id = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE entity_type = 'PERSON' AND entity_id = ? AND deleted_at IS NULL`,
      )
      .run(survivorId, duplicateId);
  }
}
