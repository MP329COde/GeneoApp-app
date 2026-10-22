import { NotFoundError, ValidationError } from '../errors.js';
import { assertId, validatePersonCreate, validatePersonUpdate } from '../validation/schemas.js';
import {
  PERSONS_PAGE_DEFAULT_LIMIT,
  PERSONS_PAGE_MAX_LIMIT,
} from '../../../db/src/repositories/person-repository.js';

/**
 * Normalise les paramètres de requête de la liste des personnes.
 *
 * Règles (jamais d'erreur 500 sur une entrée malveillante) :
 * - `limit` absent → la liste complète historique (tableau simple) ;
 * - `limit` présent → pagination, borné à [1, PERSONS_PAGE_MAX_LIMIT] ;
 *   une valeur invalide (non entière, < 1) retombe sur la valeur par défaut ;
 * - `offset` → entier >= 0 (une valeur invalide ou négative devient 0) ;
 * - `q` → recherche texte optionnelle sur nom/prénom ;
 * - `total=true` → ne renvoie que le nombre total de personnes correspondantes.
 */
export function parsePersonsListQuery(query = {}) {
  const rawLimit = query.limit;
  const rawOffset = query.offset;
  const hasLimit = rawLimit !== undefined && rawLimit !== null && rawLimit !== '';
  const hasOffset = rawOffset !== undefined && rawOffset !== null && rawOffset !== '';
  const totalOnly = query.total === 'true' || query.total === '1';

  let limit = PERSONS_PAGE_DEFAULT_LIMIT;
  if (hasLimit) {
    const parsed = Math.trunc(Number(rawLimit));
    if (Number.isFinite(parsed) && parsed >= 1) {
      limit = Math.min(parsed, PERSONS_PAGE_MAX_LIMIT);
    }
  }

  let offset = 0;
  if (hasOffset) {
    const parsed = Math.trunc(Number(rawOffset));
    if (Number.isFinite(parsed) && parsed > 0) {
      offset = parsed;
    }
  }

  const q = typeof query.q === 'string' && query.q.trim() !== '' ? query.q.trim() : undefined;

  return {
    paginated: hasLimit || hasOffset || totalOnly,
    totalOnly,
    limit,
    offset,
    q,
    includeDeleted: query.includeDeleted === 'true',
  };
}

export class PersonService {
  constructor(repository) {
    this.repository = repository;
  }

  create(payload, options) {
    const data = validatePersonCreate(payload);
    return this.repository.create(data, options);
  }

  get(id) {
    assertId(id);
    const person = this.repository.findById(id);
    if (!person) throw new NotFoundError(`Personne introuvable : ${id}`);
    return person;
  }

  list(options) {
    return this.repository.list(options);
  }

  count(options) {
    return this.repository.count(options);
  }

  update(id, payload, options) {
    assertId(id);
    const patch = validatePersonUpdate(payload);
    const existing = this.repository.findById(id);
    if (!existing) throw new NotFoundError(`Personne introuvable : ${id}`);

    const nextGivenNames = 'givenNames' in patch ? patch.givenNames : existing.given_names;
    const nextFamilyName = 'familyName' in patch ? patch.familyName : existing.family_name;
    const hasGivenNames = typeof nextGivenNames === 'string' && nextGivenNames.trim() !== '';
    const hasFamilyName = typeof nextFamilyName === 'string' && nextFamilyName.trim() !== '';
    if (!hasGivenNames && !hasFamilyName) {
      throw new ValidationError('Validation échouée', {
        fields: {
          givenNames: 'givenNames ou familyName doit être renseigné',
          familyName: 'givenNames ou familyName doit être renseigné',
        },
      });
    }

    return this.repository.update(id, patch, options);
  }

  remove(id, options) {
    assertId(id);
    const existing = this.repository.findById(id);
    if (!existing) throw new NotFoundError(`Personne introuvable : ${id}`);
    return this.repository.softDelete(id, options);
  }

  restore(id, options) {
    assertId(id);
    const existing = this.repository.findById(id, { includeDeleted: true });
    if (!existing || existing.deleted_at === null) {
      throw new NotFoundError(`Personne non supprimée ou introuvable : ${id}`);
    }
    return this.repository.restore(id, options);
  }
}
