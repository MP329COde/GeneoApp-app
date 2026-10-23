import { NotFoundError, ValidationError } from '../errors.js';
import {
  assertId,
  validatePersonCreate,
  validatePersonIdentifier,
  validatePersonUpdate,
} from '../validation/schemas.js';
import {
  PERSONS_PAGE_DEFAULT_LIMIT,
  PERSONS_PAGE_MAX_LIMIT,
} from '../../../db/src/repositories/person-repository.js';

/**
 * Normalise les paramètres de requête de la liste des personnes.
 *
 * Règles finales (jamais d'erreur 500 sur une entrée malveillante) :
 * - `total=true` → réponse `{ total }` seule, filtrée par `q` si présent ;
 * - pagination (réponse `{ items, total, limit, offset }`) SI `limit` ou `offset`
 *   est présent, ou `total=true` ; une chaîne vide (`?limit=`) compte comme
 *   « présente mais invalide » et déclenche donc la pagination ; l'absence de
 *   `limit` dans un mode paginé prend la valeur par défaut
 *   (PERSONS_PAGE_DEFAULT_LIMIT) ;
 * - sinon (aucun paramètre de pagination) → tableau simple, comme avant, mais
 *   filtré par `q` s'il est fourni ;
 * - `limit` : entier dans [1, PERSONS_PAGE_MAX_LIMIT], sinon
 *   PERSONS_PAGE_DEFAULT_LIMIT ; une chaîne vide est « présente mais invalide »
 *   et retombe donc sur la valeur par défaut ;
 * - `offset` : entier >= 0, sinon 0 ; une chaîne vide est « présente mais
 *   invalide » et retombe donc sur 0 ;
 * - `q` : recherche texte optionnelle, appliquée dans tous les modes ; un `q`
 *   présent mais vide est traité comme absent (aucun filtre), exactement comme
 *   le dépôt et le client IPC.
 *
 * La forme de la réponse ne dépend donc QUE de la présence de
 * `limit`/`offset`/`total`, jamais de `q` seul.
 */
export function parsePersonsListQuery(query = {}) {
  const rawLimit = query.limit;
  const rawOffset = query.offset;
  // Une chaîne vide (`?limit=`, `?offset=`) compte comme « présente mais
  // invalide » : la pagination est déclenchée, les valeurs retombent sur les
  // valeurs par défaut (voir plus bas).
  const hasLimit = rawLimit !== undefined && rawLimit !== null;
  const hasOffset = rawOffset !== undefined && rawOffset !== null;
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

  // `q` absent ou vide → aucun filtre (comportement du dépôt et du client
  // IPC) ; `q` non vide → filtre appliqué dans tous les modes.
  const trimmedQ = typeof query.q === 'string' ? query.q.trim() : '';
  const q = trimmedQ === '' ? undefined : trimmedQ;

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

  listIdentifiers(personId) {
    this.get(personId);
    return this.repository.listIdentifiers(personId);
  }

  addIdentifier(personId, payload, options) {
    this.get(personId);
    return this.repository.addIdentifier(personId, validatePersonIdentifier(payload), options);
  }

  removeIdentifier(personId, identifierId, options) {
    this.get(personId);
    assertId(identifierId, 'identifierId');
    if (!this.repository.removeIdentifier(personId, identifierId, options)) {
      throw new NotFoundError(`Identifiant introuvable : ${identifierId}`);
    }
  }

  /** Personnes portant un identifiant externe : plusieurs résultats = doublon probable. */
  findByIdentifier(scheme, value) {
    const normalized = validatePersonIdentifier({ scheme, value });
    return this.repository.findByIdentifier(normalized.scheme, normalized.value);
  }
}
