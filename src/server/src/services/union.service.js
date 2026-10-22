import { ConflictError, NotFoundError, ValidationError } from '../errors.js';
import { assertId, validateUnionCreate, validateUnionUpdate } from '../validation/schemas.js';

export class UnionService {
  constructor(repository) {
    this.repository = repository;
  }

  create(payload, options) {
    const data = validateUnionCreate(payload);
    if (new Set(data.partnerIds).size !== data.partnerIds.length) {
      throw new ValidationError(
        'Une personne ne peut pas être deux fois partenaire de la même union',
      );
    }
    data.partnerIds.forEach((personId) => this.#assertPerson(personId));
    this.#assertEvent(data.startEventId);
    this.#assertEvent(data.endEventId);
    return this.repository.create(data, options);
  }

  get(id) {
    assertId(id);
    const union = this.repository.findById(id);
    if (!union) throw new NotFoundError(`Union introuvable : ${id}`);
    return union;
  }

  list() {
    return this.repository.list();
  }

  #assertEvent(eventId) {
    if (eventId === undefined || eventId === null) return;
    const exists = this.repository.database
      .prepare('SELECT 1 FROM events WHERE id = ? AND deleted_at IS NULL')
      .get(eventId);
    if (!exists) throw new NotFoundError(`Événement introuvable : ${eventId}`);
  }

  #assertPerson(personId) {
    const exists = this.repository.database
      .prepare('SELECT 1 FROM persons WHERE id = ? AND deleted_at IS NULL')
      .get(personId);
    if (!exists) throw new NotFoundError(`Personne introuvable : ${personId}`);
  }

  update(id, payload, options) {
    this.get(id);
    const patch = validateUnionUpdate(payload);
    this.#assertEvent(patch.startEventId);
    this.#assertEvent(patch.endEventId);
    return this.repository.update(id, patch, options);
  }

  addPartner(id, payload, options) {
    const union = this.get(id);
    const personId = payload?.personId;
    assertId(personId, 'personId');
    this.#assertPerson(personId);
    if (union.partnerIds.includes(personId)) {
      throw new ConflictError('Cette personne est déjà partenaire de cette union');
    }
    return this.repository.addPartner(id, personId, options);
  }

  removePartner(id, personId, options) {
    const union = this.get(id);
    assertId(personId, 'personId');
    if (!union.partnerIds.includes(personId)) {
      throw new NotFoundError(`Partenaire introuvable : ${personId}`);
    }
    if (union.partnerIds.length <= 2) {
      throw new ValidationError('Une union nécessite au moins deux partenaires');
    }
    return this.repository.removePartner(id, personId, options);
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
