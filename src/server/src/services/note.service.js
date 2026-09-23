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
const MAX_BODY = 50_000;

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
    if (body.length > MAX_BODY) throw new ValidationError('body trop long');
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

  listAll({ entityType, q, contradictionsOnly } = {}) {
    if (entityType && !ENTITY_TYPES.has(entityType)) {
      throw new ValidationError('entityType de note invalide');
    }
    if (q !== undefined && (typeof q !== 'string' || q.length > 200)) {
      throw new ValidationError('Recherche invalide');
    }
    return this.repository.listAll({
      entityType: entityType || null,
      query: q?.trim() || null,
      contradictionsOnly: contradictionsOnly === true || contradictionsOnly === 'true',
    });
  }

  update(id, payload, options) {
    const noteId = Number(id);
    this.get(noteId);
    const { title, body, confidence, isContradiction } = payload ?? {};
    if (
      title !== undefined &&
      title !== null &&
      (typeof title !== 'string' || title.length > 200)
    ) {
      throw new ValidationError('title invalide');
    }
    if (
      body !== undefined &&
      (typeof body !== 'string' || body.trim() === '' || body.length > MAX_BODY)
    ) {
      throw new ValidationError('body invalide');
    }
    if (confidence !== undefined && !CONFIDENCE_LEVELS.has(confidence)) {
      throw new ValidationError('confidence invalide');
    }
    return this.repository.update(
      noteId,
      {
        title: title === undefined ? undefined : title?.trim() || null,
        body,
        confidence,
        isContradiction: isContradiction === undefined ? undefined : Boolean(isContradiction),
      },
      options,
    );
  }

  remove(id, options) {
    if (!this.repository.softDelete(Number(id), options)) {
      throw new NotFoundError(`Note introuvable : ${id}`);
    }
  }
}
