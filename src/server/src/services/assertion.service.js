import { NotFoundError } from '../errors.js';
import {
  assertId,
  validateAssertionCreate,
  validateAssertionStatus,
  validateAssertionUpdate,
} from '../validation/schemas.js';

/**
 * Affirmations, niveaux de preuve et contradictions. Le service ne tranche
 * jamais : retenir ou écarter une valeur est toujours une action explicite.
 */
export class AssertionService {
  constructor(repository) {
    this.repository = repository;
  }

  create(payload, options) {
    const data = validateAssertionCreate(payload);
    if (!this.repository.entityExists(data.entityType, data.entityId)) {
      throw new NotFoundError(`Entité introuvable : ${data.entityType}#${data.entityId}`);
    }
    return this.repository.create(data, options);
  }

  get(id) {
    assertId(id);
    const assertion = this.repository.findById(id);
    if (!assertion) throw new NotFoundError(`Affirmation introuvable : ${id}`);
    return assertion;
  }

  list({ entityType, entityId, field, status } = {}) {
    const filters = {};
    if (entityType !== undefined) filters.entityType = String(entityType);
    if (entityId !== undefined) {
      filters.entityId = Number(entityId);
      assertId(filters.entityId, 'entityId');
    }
    if (field !== undefined) filters.field = String(field).trim().toLowerCase();
    if (status !== undefined) filters.status = validateAssertionStatus(String(status));
    return this.repository.list(filters);
  }

  conflicts({ entityType, entityId } = {}) {
    const filters = {};
    if (entityType !== undefined) filters.entityType = String(entityType);
    if (entityId !== undefined) {
      filters.entityId = Number(entityId);
      assertId(filters.entityId, 'entityId');
    }
    return this.repository.listConflicts(filters);
  }

  update(id, payload, options) {
    this.get(id);
    return this.repository.update(id, validateAssertionUpdate(payload), options);
  }

  setStatus(id, status, options) {
    this.get(id);
    return this.repository.setStatus(id, validateAssertionStatus(status), options);
  }

  remove(id, options) {
    this.get(id);
    return this.repository.softDelete(id, options);
  }

  restore(id, options) {
    assertId(id);
    const existing = this.repository.findById(id, { includeDeleted: true });
    if (!existing || existing.deleted_at === null) {
      throw new NotFoundError(`Affirmation non supprimée ou introuvable : ${id}`);
    }
    return this.repository.restore(id, options);
  }
}
