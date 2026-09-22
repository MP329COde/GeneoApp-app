import { NotFoundError } from '../errors.js';
import { assertId, validateParentageCreate } from '../validation/schemas.js';

export class ParentageService {
  constructor(repository) {
    this.repository = repository;
  }

  create(payload, options) {
    const data = validateParentageCreate(payload);
    return this.repository.create(data, options);
  }

  get(id) {
    assertId(id);
    const parentage = this.repository.findById(id);
    if (!parentage) throw new NotFoundError(`Filiation introuvable : ${id}`);
    return parentage;
  }

  listParentsOf(childId) {
    assertId(childId, 'childId');
    return this.repository.findParentsOf(childId);
  }

  listChildrenOf(parentId) {
    assertId(parentId, 'parentId');
    return this.repository.findChildrenOf(parentId);
  }

  remove(id, options) {
    assertId(id);
    const existing = this.repository.findById(id);
    if (!existing) throw new NotFoundError(`Filiation introuvable : ${id}`);
    return this.repository.softDelete(id, options);
  }

  restore(id, options) {
    assertId(id);
    const existing = this.repository.findById(id, { includeDeleted: true });
    if (!existing || existing.deleted_at === null) {
      throw new NotFoundError(`Filiation non supprimée ou introuvable : ${id}`);
    }
    return this.repository.restore(id, options);
  }
}
