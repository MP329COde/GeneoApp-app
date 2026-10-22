import { NotFoundError } from '../errors.js';
import { assertId, validateSourceCreate, validateCitationCreate } from '../validation/schemas.js';

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
}
