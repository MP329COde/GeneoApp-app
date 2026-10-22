import { withTransaction, recordAudit } from '../../../db/src/repositories/base-repository.js';
import { NotFoundError, ValidationError } from '../errors.js';
import { assertId } from '../validation/schemas.js';
import { normalize } from './search.service.js';

// Champs d'identité comparés lors d'une fusion : colonne, nom du champ d'affirmation.
const IDENTITY_FIELDS = [
  ['given_names', 'given_names'],
  ['family_name', 'family_name'],
  ['birth_family_name', 'birth_family_name'],
  ['married_name', 'married_name'],
  ['alias', 'alias'],
  ['nickname', 'nickname'],
  ['title', 'title'],
  ['suffix', 'suffix'],
  ['sex', 'sex'],
];

// Fusionne deux fiches personne identifiées comme doublons potentiels
// (`SearchService#potentialDuplicates`). La personne "survivor" conserve son
// identité ; toute donnée réelle portée par "duplicate" (filiations, unions,
// participations à un événement, identifiants externes, affirmations,
// citations, notes, médias) est réattribuée
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
      identity: this.#identityDifferences(survivor, duplicate),
      reassignments: {
        parentagesAsParent: this.#count('parentages', 'parent_id', duplicateId),
        parentagesAsChild: this.#count('parentages', 'child_id', duplicateId),
        unionPartnerships: this.#count('union_partners', 'person_id', duplicateId),
        eventParticipations: this.#count('event_participants', 'person_id', duplicateId),
        citations: this.#countEntity('citations', duplicateId),
        assertions: this.#countEntity('assertions', duplicateId),
        identifiers: this.#count('person_identifiers', 'person_id', duplicateId),
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
    const survivorBefore = this.#findPerson(survivorId);
    const duplicateBefore = this.#findPerson(duplicateId);

    return withTransaction(this.database, () => {
      const { conflicts, fills } = this.#identityDifferences(survivorBefore, duplicateBefore);
      const identityAssertions = this.#recordIdentityConflicts(
        survivorId,
        duplicateBefore,
        conflicts,
        performedBy,
      );
      if (fills.length > 0) {
        const columnOf = Object.fromEntries(
          IDENTITY_FIELDS.map(([column, field]) => [field, column]),
        );
        const assignments = fills.map(({ field }) => `${columnOf[field]} = @${field}`).join(', ');
        this.database
          .prepare(
            `UPDATE persons SET ${assignments}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE id = @id`,
          )
          .run({ id: survivorId, ...Object.fromEntries(fills.map((f) => [f.field, f.value])) });
        recordAudit(this.database, {
          tableName: 'persons',
          rowId: survivorId,
          operation: 'UPDATE',
          changes: Object.fromEntries(fills.map((f) => [f.field, f.value])),
          performedBy,
        });
      }

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

      this.#reassignJunction({
        table: 'person_identifiers',
        ownColumn: 'person_id',
        matchColumns: ['scheme', 'value'],
        survivorId,
        duplicateId,
      });

      this.#reassignPolymorphic('gedcom_extensions', survivorId, duplicateId);
      this.#reassignAssertions(survivorId, duplicateId);
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

      const eventAssertions = this.#recordEventConflicts(survivorId, performedBy);
      return {
        ...this.#findPerson(survivorId),
        mergeReport: {
          identityConflicts: conflicts.map(({ field }) => field),
          filledFields: fills.map(({ field }) => field),
          identityAssertions: identityAssertions.length,
          eventAssertions: eventAssertions.length,
        },
      };
    });
  }

  // Compare l'identité des deux fiches. Une valeur différente des deux côtés est
  // une contradiction : elle est conservée (jamais écrasée). Un champ vide du
  // côté conservé mais renseigné sur le doublon peut être complété.
  #identityDifferences(survivor, duplicate) {
    const conflicts = [];
    const fills = [];
    for (const [column, field] of IDENTITY_FIELDS) {
      const kept = survivor[column] ?? '';
      const other = duplicate[column] ?? '';
      const isEmpty = (value) => String(value).trim() === '' || (column === 'sex' && value === 'U');
      if (isEmpty(other)) continue;
      if (isEmpty(kept)) fills.push({ field, value: other });
      else if (normalize(String(kept)) !== normalize(String(other))) {
        conflicts.push({ field, kept, other });
      }
    }
    return { conflicts, fills };
  }

  // Les contradictions d'identité deviennent des affirmations : la valeur de la
  // fiche conservée est « retenue », celle du doublon reste « proposée ». Aucune
  // des deux n'est perdue, et le conflit est visible dans /api/assertions/conflicts.
  #recordIdentityConflicts(survivorId, duplicate, conflicts, performedBy) {
    const insert = this.database.prepare(
      `INSERT INTO assertions (entity_type, entity_id, field, value, status, reasoning)
       VALUES ('PERSON', ?, ?, ?, ?, ?)`,
    );
    const existing = this.database.prepare(
      `SELECT value, status FROM assertions
       WHERE entity_type = 'PERSON' AND entity_id = ? AND field = ? AND deleted_at IS NULL`,
    );
    const label = `${duplicate.given_names} ${duplicate.family_name}`.trim();
    const created = [];
    for (const { field, kept, other } of conflicts) {
      const known = existing.all(survivorId, field);
      const has = (value) => known.some((row) => normalize(row.value) === normalize(String(value)));
      const hasAccepted = known.some((row) => row.status === 'ACCEPTED');
      if (!has(kept)) {
        insert.run(
          survivorId,
          field,
          String(kept),
          hasAccepted ? 'PROPOSED' : 'ACCEPTED',
          'Valeur de la fiche conservée lors de la fusion',
        );
      }
      if (!has(other)) {
        const info = insert.run(
          survivorId,
          field,
          String(other),
          'PROPOSED',
          `Valeur de la fiche fusionnée #${duplicate.id} (${label})`,
        );
        created.push(info.lastInsertRowid);
        recordAudit(this.database, {
          tableName: 'assertions',
          rowId: info.lastInsertRowid,
          operation: 'INSERT',
          changes: { entityType: 'PERSON', entityId: survivorId, field, value: other },
          performedBy,
        });
      }
    }
    return created;
  }

  // Dates et lieux de naissance / décès : si, après réattribution, la personne
  // porte plusieurs événements de même type aux valeurs différentes, chaque
  // valeur devient une affirmation proposée (les événements eux-mêmes sont
  // tous conservés).
  #recordEventConflicts(survivorId, performedBy) {
    const rows = this.database
      .prepare(
        `SELECT e.id, e.type, e.date_text, pl.name AS place
         FROM events e
         JOIN event_participants ep ON ep.event_id = e.id AND ep.deleted_at IS NULL
         LEFT JOIN places pl ON pl.id = e.place_id
         WHERE ep.person_id = ? AND ep.role = 'PRINCIPAL' AND e.deleted_at IS NULL
           AND e.type IN ('BIRTH', 'DEATH') ORDER BY e.id`,
      )
      .all(survivorId);
    const insert = this.database.prepare(
      `INSERT INTO assertions (entity_type, entity_id, field, value, status, reasoning)
       VALUES ('PERSON', ?, ?, ?, 'PROPOSED', ?)`,
    );
    const hasAssertion = this.database.prepare(
      `SELECT 1 FROM assertions
       WHERE entity_type = 'PERSON' AND entity_id = ? AND field = ? AND value = ?
         AND deleted_at IS NULL`,
    );
    const recorded = [];
    for (const type of ['BIRTH', 'DEATH']) {
      const events = rows.filter((row) => row.type === type);
      for (const [column, suffix] of [
        ['date_text', 'date'],
        ['place', 'place'],
      ]) {
        const values = events.filter((event) => event[column]);
        const distinct = new Set(values.map((event) => normalize(event[column])));
        if (distinct.size < 2) continue;
        const field = `${type.toLowerCase()}_${suffix}`;
        for (const event of values) {
          if (hasAssertion.get(survivorId, field, event[column])) continue;
          const info = insert.run(
            survivorId,
            field,
            event[column],
            `Événement #${event.id} conservé lors de la fusion`,
          );
          recorded.push({ id: info.lastInsertRowid, field, value: event[column] });
          recordAudit(this.database, {
            tableName: 'assertions',
            rowId: info.lastInsertRowid,
            operation: 'INSERT',
            changes: { entityType: 'PERSON', entityId: survivorId, field },
            performedBy,
          });
        }
      }
    }
    return recorded;
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

  // Les affirmations du doublon sont conservées telles quelles : deux valeurs
  // différentes pour un même champ deviennent une contradiction visible, jamais
  // un écrasement. Une seule affirmation peut être retenue par champ : si le
  // survivant en a déjà une, celle du doublon redevient « proposée ».
  #reassignAssertions(survivorId, duplicateId) {
    this.database
      .prepare(
        `UPDATE assertions SET status = 'PROPOSED',
                               updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE entity_type = 'PERSON' AND entity_id = ? AND status = 'ACCEPTED'
           AND deleted_at IS NULL
           AND field IN (
             SELECT field FROM assertions
             WHERE entity_type = 'PERSON' AND entity_id = ? AND status = 'ACCEPTED'
               AND deleted_at IS NULL
           )`,
      )
      .run(duplicateId, survivorId);
    this.#reassignPolymorphic('assertions', survivorId, duplicateId);
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
