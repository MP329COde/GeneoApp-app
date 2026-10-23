import { ConflictError, NotFoundError } from '../errors.js';
import {
  assertId,
  validateSourceCreate,
  validateSourceUpdate,
  validateCitationCreate,
  validateCitationUpdate,
} from '../validation/schemas.js';

export class SourceService {
  constructor(repository) {
    this.repository = repository;
  }

  create(payload, options) {
    const data = validateSourceCreate(payload);
    return this.repository.create(data, options);
  }

  get(id) {
    assertId(id);
    const source = this.repository.findById(id);
    if (!source) throw new NotFoundError(`Source introuvable : ${id}`);
    return source;
  }

  addCitation(payload, options) {
    const data = validateCitationCreate(payload);
    const source = this.repository.findById(data.sourceId);
    if (!source) throw new NotFoundError(`Source introuvable : ${data.sourceId}`);
    if (!this.repository.citationTargetExists(data.entityType, data.entityId)) {
      throw new NotFoundError(`Entité introuvable : ${data.entityType}#${data.entityId}`);
    }
    return this.repository.addCitation(data, options);
  }

  listCitationsForEntity(entityType, entityId) {
    assertId(entityId, 'entityId');
    return this.repository.findCitationsForEntity(entityType, entityId);
  }

  list() {
    return this.repository.list();
  }

  update(id, payload, options) {
    this.get(id);
    return this.repository.update(id, validateSourceUpdate(payload), options);
  }

  /**
   * Une source encore citée, jointe à un média ou invoquée comme preuve ne
   * peut pas être supprimée : on ne laisse pas de références orphelines.
   */
  remove(id, options) {
    this.get(id);
    const usage = this.repository.usageOf(id);
    if (usage.citations + usage.media + usage.evidence > 0) {
      throw new ConflictError(
        `Source encore utilisée (${usage.citations} citation(s), ${usage.media} média(s), ${usage.evidence} preuve(s))`,
      );
    }
    return this.repository.softDelete(id, options);
  }

  restore(id, options) {
    assertId(id);
    const existing = this.repository.findById(id, { includeDeleted: true });
    if (!existing || existing.deleted_at === null) {
      throw new NotFoundError(`Source non supprimée ou introuvable : ${id}`);
    }
    return this.repository.restore(id, options);
  }

  getCitation(id) {
    assertId(id);
    const citation = this.repository.findCitationById(id);
    if (!citation) throw new NotFoundError(`Citation introuvable : ${id}`);
    return citation;
  }

  updateCitation(id, payload, options) {
    this.getCitation(id);
    return this.repository.updateCitation(id, validateCitationUpdate(payload), options);
  }

  removeCitation(id, options) {
    this.getCitation(id);
    return this.repository.softDeleteCitation(id, options);
  }

  restoreCitation(id, options) {
    assertId(id);
    const existing = this.repository.findCitationById(id, { includeDeleted: true });
    if (!existing || existing.deleted_at === null) {
      throw new NotFoundError(`Citation non supprimée ou introuvable : ${id}`);
    }
    return this.repository.restoreCitation(id, options);
  }
}
