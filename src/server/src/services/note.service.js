import { NotFoundError, ValidationError } from '../errors.js';

const ENTITY_TYPES = new Set([
  'PERSON',
  'FAMILY',
  'EVENT',
  'SOURCE',
  'CITATION',
  'PLACE',
  'TREE',
  'SEARCH',
]);
const CONFIDENCE_LEVELS = new Set(['LOW', 'MEDIUM', 'HIGH']);

export class NoteService {
  constructor(repository) {
    this.repository = repository;
  }

  create(payload, options) {
    const {
      entityType,
      entityId,
      title = null,
      body,
      confidence = 'MEDIUM',
      isContradiction = false,
    } = payload ?? {};
    if (!ENTITY_TYPES.has(entityType)) {
      throw new ValidationError('entityType de note invalide');
    }
    if (!Number.isInteger(entityId) || entityId <= 0) {
      throw new ValidationError('entityId doit être un identifiant positif');
    }
    if (typeof body !== 'string' || body.trim() === '') {
      throw new ValidationError('body est obligatoire');
    }
    if (!CONFIDENCE_LEVELS.has(confidence)) {
      throw new ValidationError('confidence invalide');
    }
    return this.repository.create(
      { entityType, entityId, title, body, confidence, isContradiction: Boolean(isContradiction) },
      options,
    );
  }

  listForEntity(entityType, entityId) {
    if (!ENTITY_TYPES.has(entityType)) throw new ValidationError('entityType de note invalide');
    if (!Number.isInteger(entityId) || entityId <= 0)
      throw new ValidationError('entityId invalide');
    return this.repository.listForEntity(entityType, entityId);
  }

  get(id) {
    const note = this.repository.findById(id);
    if (!note) throw new NotFoundError(`Note introuvable : ${id}`);
    return note;
  }
}
