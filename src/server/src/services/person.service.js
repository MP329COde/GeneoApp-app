import { NotFoundError, ValidationError } from '../errors.js';
import { assertId, validatePersonCreate, validatePersonUpdate } from '../validation/schemas.js';

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
