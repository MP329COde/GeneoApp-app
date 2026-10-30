import { ConflictError, NotFoundError } from '../errors.js';
import {
  assertId,
  validateParentageCreate,
  validateParentageUpdate,
} from '../validation/schemas.js';

export class ParentageService {
  constructor(repository) {
    this.repository = repository;
  }

  create(payload, options) {
    const data = validateParentageCreate(payload);
    this.#assertPerson(data.childId);
    this.#assertPerson(data.parentId);
    this.#assertUnion(data.unionId);
    const duplicate = this.repository.database
      .prepare(
        'SELECT 1 FROM parentages WHERE child_id = ? AND parent_id = ? AND deleted_at IS NULL',
      )
      .get(data.childId, data.parentId);
    if (duplicate) throw new ConflictError('Cette filiation existe déjà');
    // Une personne ne peut pas descendre d'elle-même : refuser de faire d'un
    // descendant (ou de l'enfant lui-même) le parent de son propre ascendant.
    if (this.repository.isSelfOrAncestor(data.childId, data.parentId)) {
      throw new ConflictError(
        'Cette filiation créerait un cycle : le parent descend déjà de cet enfant',
      );
    }
    return this.repository.create(data, options);
  }

  #assertPerson(personId) {
    const exists = this.repository.database
      .prepare('SELECT 1 FROM persons WHERE id = ? AND deleted_at IS NULL')
      .get(personId);
    if (!exists) throw new NotFoundError(`Personne introuvable : ${personId}`);
  }

  #assertUnion(unionId) {
    if (unionId === null || unionId === undefined) return;
    const exists = this.repository.database
      .prepare('SELECT 1 FROM unions WHERE id = ? AND deleted_at IS NULL')
      .get(unionId);
    if (!exists) throw new NotFoundError(`Union introuvable : ${unionId}`);
  }

  list() {
    return this.repository.list();
  }

  update(id, payload, options) {
    this.get(id);
    const patch = validateParentageUpdate(payload);
    this.#assertUnion(patch.unionId);
    return this.repository.update(id, patch, options);
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
