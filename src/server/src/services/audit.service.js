import { ValidationError } from '../errors.js';
import { assertId } from '../validation/schemas.js';

// Rétention maximale appliquée à la purge : on ne supprime jamais un
// journal de traçabilité en bloc. Passé ce délai, la purge est refusée —
// l'utilisateur doit demander une période plus courte.
const MAX_RETENTION_DAYS = 3650;

const AUDITABLE_TABLES = [
  'persons',
  'places',
  'events',
  'event_participants',
  'unions',
  'union_partners',
  'parentages',
  'sources',
  'citations',
  'media',
  'database',
  'accounts',
];

export class AuditService {
  constructor(repository) {
    this.repository = repository;
  }

  listForEntity(tableName, rowId) {
    if (!AUDITABLE_TABLES.includes(tableName)) {
      throw new ValidationError(`tableName invalide : ${tableName}`);
    }
    assertId(rowId, 'rowId');
    return this.repository.findForEntity(tableName, rowId);
  }

  /**
   * Purge les entrées de journal plus anciennes que `days` jours.
   *
   * La purge est explicite : le journal d'audit retrace les modifications
   * apportées aux fiches, et l'utilisateur peut vouloir le conserver. Elle
   * est bornée (délai maximal) et refuse un délai nul, qui effacerait
   * l'intégralité du journal.
   */
  purgeOlderThan(days) {
    const requested = Number(days);
    if (!Number.isInteger(requested) || requested <= 0) {
      throw new ValidationError('days doit être un entier positif');
    }
    if (requested > MAX_RETENTION_DAYS) {
      throw new ValidationError(
        `La purge est limitée à ${MAX_RETENTION_DAYS} jours : le journal d’audit retrace les modifications des fiches`,
      );
    }

    // La date de coupure est calculée en UTC, sur une base ISO comparable
    // au format produit par le défaut de colonne (…Z).
    const cutoff = new Date(Date.now() - requested * 24 * 60 * 60 * 1000).toISOString();
    const deleted = this.repository.purgeBefore(cutoff);
    return { deleted, cutoff, remaining: this.repository.count() };
  }
}

export { AUDITABLE_TABLES };
