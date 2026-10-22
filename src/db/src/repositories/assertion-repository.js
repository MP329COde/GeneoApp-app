import { withTransaction, recordAudit } from './base-repository.js';

const ENTITY_TABLES = {
  PERSON: 'persons',
  EVENT: 'events',
  UNION: 'unions',
  PARENTAGE: 'parentages',
  PLACE: 'places',
};

/** Comparaison de valeurs sans tenir compte de la casse ni des espaces superflus. */
function normalizeValue(value) {
  return String(value).trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Affirmations sur une donnée généalogique (entité, champ, valeur), chacune
 * avec son statut, son niveau de preuve et ses citations.
 *
 * Plusieurs valeurs différentes pour un même champ ne s'écrasent jamais :
 * elles coexistent et forment une contradiction tant qu'aucune n'est retenue
 * et que les autres ne sont pas explicitement écartées. Aucun statut n'est
 * jamais modifié sans demande explicite : le dépôt ne tranche pas à la place
 * de l'utilisateur.
 */
export class AssertionRepository {
  constructor(database) {
    this.database = database;
  }

  entityExists(entityType, entityId) {
    const table = ENTITY_TABLES[entityType];
    if (!table) return false;
    return Boolean(
      this.database
        .prepare(`SELECT 1 FROM ${table} WHERE id = ? AND deleted_at IS NULL`)
        .get(entityId),
    );
  }

  create(
    { entityType, entityId, field, value, proofLevel = 'UNSUPPORTED', reasoning = null },
    { performedBy = null } = {},
  ) {
    return withTransaction(this.database, () => {
      if (!this.entityExists(entityType, entityId)) {
        throw new Error(`Entité introuvable : ${entityType}#${entityId}`);
      }
      const info = this.database
        .prepare(
          `INSERT INTO assertions (entity_type, entity_id, field, value, proof_level, reasoning)
           VALUES (@entityType, @entityId, @field, @value, @proofLevel, @reasoning)`,
        )
        .run({ entityType, entityId, field, value, proofLevel, reasoning });
      recordAudit(this.database, {
        tableName: 'assertions',
        rowId: info.lastInsertRowid,
        operation: 'INSERT',
        changes: { entityType, entityId, field, value, proofLevel, reasoning },
        performedBy,
      });
      return this.findById(info.lastInsertRowid);
    });
  }

  findById(id, { includeDeleted = false } = {}) {
    const clause = includeDeleted ? '' : 'AND deleted_at IS NULL';
    const row = this.database.prepare(`SELECT * FROM assertions WHERE id = ? ${clause}`).get(id);
    return row ? { ...row, support: this.supportOf(row.id) } : null;
  }

  list({ entityType, entityId, field, status } = {}) {
    const conditions = ['deleted_at IS NULL'];
    const params = {};
    for (const [key, column, value] of [
      ['entityType', 'entity_type', entityType],
      ['entityId', 'entity_id', entityId],
      ['field', 'field', field],
      ['status', 'status', status],
    ]) {
      if (value !== undefined && value !== null) {
        conditions.push(`${column} = @${key}`);
        params[key] = value;
      }
    }
    return this.database
      .prepare(
        `SELECT * FROM assertions WHERE ${conditions.join(' AND ')}
         ORDER BY entity_type, entity_id, field, id`,
      )
      .all(params)
      .map((row) => ({ ...row, support: this.supportOf(row.id) }));
  }

  update(id, patch, { performedBy = null } = {}) {
    const columns = { value: 'value', proofLevel: 'proof_level', reasoning: 'reasoning' };
    const fields = Object.keys(patch).filter((key) => key in columns);
    if (fields.length === 0) throw new Error('Aucun champ modifiable fourni');

    return withTransaction(this.database, () => {
      if (!this.findById(id)) throw new Error(`Affirmation introuvable : ${id}`);
      this.database
        .prepare(
          `UPDATE assertions SET ${fields.map((f) => `${columns[f]} = @${f}`).join(', ')},
                                 updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = @id AND deleted_at IS NULL`,
        )
        .run({ id, ...Object.fromEntries(fields.map((f) => [f, patch[f]])) });
      recordAudit(this.database, {
        tableName: 'assertions',
        rowId: id,
        operation: 'UPDATE',
        changes: Object.fromEntries(fields.map((f) => [f, patch[f]])),
        performedBy,
      });
      return this.findById(id);
    });
  }

  /**
   * Change le statut d'une affirmation. Retenir une affirmation demande de la
   * place : si une autre est déjà retenue pour ce champ, elle redevient
   * « proposée » (jamais écartée d'office) ; la décision d'écarter les autres
   * valeurs reste à l'utilisateur.
   */
  setStatus(id, status, { performedBy = null } = {}) {
    return withTransaction(this.database, () => {
      const assertion = this.findById(id);
      if (!assertion) throw new Error(`Affirmation introuvable : ${id}`);
      if (assertion.status === status) return assertion;

      if (status === 'ACCEPTED') {
        const previous = this.database
          .prepare(
            `SELECT id FROM assertions
             WHERE entity_type = ? AND entity_id = ? AND field = ?
               AND status = 'ACCEPTED' AND deleted_at IS NULL AND id != ?`,
          )
          .get(assertion.entity_type, assertion.entity_id, assertion.field, id);
        if (previous) {
          this.database
            .prepare(
              `UPDATE assertions SET status = 'PROPOSED',
                                     updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
               WHERE id = ?`,
            )
            .run(previous.id);
          recordAudit(this.database, {
            tableName: 'assertions',
            rowId: previous.id,
            operation: 'UPDATE',
            changes: { status: 'PROPOSED', reason: `affirmation #${id} retenue à sa place` },
            performedBy,
          });
        }
      }

      this.database
        .prepare(
          `UPDATE assertions SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ?`,
        )
        .run(status, id);
      recordAudit(this.database, {
        tableName: 'assertions',
        rowId: id,
        operation: 'UPDATE',
        changes: { status },
        performedBy,
      });
      return this.findById(id);
    });
  }

  softDelete(id, { performedBy = null } = {}) {
    return withTransaction(this.database, () => {
      const result = this.database
        .prepare(
          `UPDATE assertions SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                                 updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ? AND deleted_at IS NULL`,
        )
        .run(id);
      if (result.changes === 0) return false;
      recordAudit(this.database, {
        tableName: 'assertions',
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
        throw new Error(`Affirmation non supprimée ou introuvable : ${id}`);
      }
      // L'index unique n'admet qu'une affirmation retenue par champ : si une
      // autre l'est devenue entre-temps, celle-ci revient « proposée ».
      const status =
        existing.status === 'ACCEPTED' &&
        this.database
          .prepare(
            `SELECT 1 FROM assertions
             WHERE entity_type = ? AND entity_id = ? AND field = ?
               AND status = 'ACCEPTED' AND deleted_at IS NULL`,
          )
          .get(existing.entity_type, existing.entity_id, existing.field)
          ? 'PROPOSED'
          : existing.status;
      this.database
        .prepare(
          `UPDATE assertions SET deleted_at = NULL, status = ?,
                                 updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ?`,
        )
        .run(status, id);
      recordAudit(this.database, {
        tableName: 'assertions',
        rowId: id,
        operation: 'RESTORE',
        performedBy,
      });
      return this.findById(id);
    });
  }

  /** Synthèse des citations qui étayent une affirmation. */
  supportOf(assertionId) {
    const citations = this.database
      .prepare(
        `SELECT c.source_id, c.evidence_type, c.information_quality, s.source_kind
         FROM citations c JOIN sources s ON s.id = c.source_id AND s.deleted_at IS NULL
         WHERE c.entity_type = 'ASSERTION' AND c.entity_id = ? AND c.deleted_at IS NULL`,
      )
      .all(assertionId);
    const count = (predicate) => citations.filter(predicate).length;
    const independentSources = new Set(citations.map((c) => c.source_id)).size;
    const direct = count((c) => c.evidence_type === 'DIRECT');
    const indirect = count((c) => c.evidence_type === 'INDIRECT');
    const negative = count((c) => c.evidence_type === 'NEGATIVE');
    const primary = count((c) => c.information_quality === 'PRIMARY');
    return {
      citations: citations.length,
      independentSources,
      direct,
      indirect,
      negative,
      primary,
      suggestedProofLevel: suggestProofLevel({
        citations: citations.length,
        independentSources,
        direct,
        indirect,
        negative,
        primary,
      }),
    };
  }

  /**
   * Contradictions ouvertes : champs pour lesquels plusieurs valeurs
   * différentes restent en lice (ni écartées, ni en doublon exact). Une
   * affirmation retenue ne clôt pas la contradiction tant que d'autres valeurs
   * restent proposées. Résultat : un groupe par (entité, champ).
   */
  listConflicts({ entityType, entityId } = {}) {
    const groups = new Map();
    for (const assertion of this.list({ entityType, entityId })) {
      if (assertion.status === 'REJECTED') continue;
      const key = `${assertion.entity_type}#${assertion.entity_id}#${assertion.field}`;
      if (!groups.has(key)) {
        groups.set(key, {
          entityType: assertion.entity_type,
          entityId: assertion.entity_id,
          field: assertion.field,
          assertions: [],
        });
      }
      groups.get(key).assertions.push(assertion);
    }
    return [...groups.values()]
      .filter((group) => new Set(group.assertions.map((a) => normalizeValue(a.value))).size > 1)
      .map((group) => ({
        ...group,
        accepted: group.assertions.find((a) => a.status === 'ACCEPTED') ?? null,
      }));
  }
}

/**
 * Niveau de preuve SUGGÉRÉ d'après les citations, à titre indicatif : le
 * niveau enregistré sur l'affirmation reste celui que l'utilisateur choisit.
 * Règles volontairement prudentes, sans effet de bord :
 * - aucune citation : non étayée ;
 * - une preuve négative plafonne à « possible » (une source dit le contraire) ;
 * - prouvée : au moins deux sources distinctes en preuve directe, dont une
 *   d'information primaire ;
 * - probable : une preuve directe, ou au moins deux preuves indirectes ;
 * - sinon possible.
 */
export function suggestProofLevel({
  citations,
  independentSources,
  direct,
  indirect,
  negative,
  primary,
}) {
  if (citations === 0) return 'UNSUPPORTED';
  if (negative > 0) return 'POSSIBLE';
  if (direct >= 2 && independentSources >= 2 && primary >= 1) return 'PROVEN';
  if (direct >= 1 || indirect >= 2) return 'PROBABLE';
  return 'POSSIBLE';
}
