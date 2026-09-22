import { NotFoundError } from '../errors.js';
import { assertId, validateUnionCreate } from '../validation/schemas.js';

export class UnionService {
  constructor(repository) {
    this.repository = repository;
  }

  create(payload, options) {
    const data = validateUnionCreate(payload);
    return this.repository.create(data, options);
  }

  get(id) {
    assertId(id);
    const union = this.repository.findById(id);
    if (!union) throw new NotFoundError(`Union introuvable : ${id}`);
    return union;
  }

  listForPerson(personId) {
    assertId(personId, 'personId');
    return this.repository.findForPerson(personId);
  }

  remove(id, options) {
    assertId(id);
    const existing = this.repository.findById(id);
    if (!existing) throw new NotFoundError(`Union introuvable : ${id}`);
    return this.repository.softDelete(id, options);
  }

  restore(id, options) {
    assertId(id);
    const existing = this.repository.findById(id, { includeDeleted: true });
    if (!existing || existing.deleted_at === null) {
      throw new NotFoundError(`Union non supprimée ou introuvable : ${id}`);
    }
    return this.repository.restore(id, options);
  }
}
