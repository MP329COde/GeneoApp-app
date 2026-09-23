import { NotFoundError, ValidationError } from '../errors.js';

const STATUSES = new Set(['TODO', 'IN_PROGRESS', 'DONE', 'ABANDONED']);
const PRIORITIES = new Set(['LOW', 'MEDIUM', 'HIGH']);
const HYPOTHESIS_STATUSES = new Set(['OPEN', 'SUPPORTED', 'REJECTED']);
const STANCES = new Set(['SUPPORTS', 'CONTRADICTS', 'NEUTRAL']);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TITLE_MAX = 200;
const TEXT_MAX = 20_000;

function requiredText(value, field, max = TITLE_MAX) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ValidationError(`${field} est obligatoire`, { fields: { [field]: 'obligatoire' } });
  }
  if (value.length > max) {
    throw new ValidationError(`${field} dépasse ${max} caractères`, {
      fields: { [field]: 'trop long' },
    });
  }
  return value.trim();
}

function optionalText(value, field, max = TEXT_MAX) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > max) {
    throw new ValidationError(`${field} invalide`, { fields: { [field]: 'invalide' } });
  }
  return value;
}

function oneOf(value, allowed, field) {
  if (value === undefined) return undefined;
  if (!allowed.has(value))
    throw new ValidationError(`${field} invalide`, { fields: { [field]: 'invalide' } });
  return value;
}

function optionalDate(value, field) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || !ISO_DATE.test(value) || Number.isNaN(Date.parse(value))) {
    throw new ValidationError(`${field} doit être une date AAAA-MM-JJ`, {
      fields: { [field]: 'invalide' },
    });
  }
  return value;
}

function optionalId(value, field) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ValidationError(`${field} invalide`, { fields: { [field]: 'invalide' } });
  }
  return id;
}

function positiveId(value, label) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new ValidationError(`${label} invalide`);
  return id;
}

function withoutUndefined(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
}

export class ResearchService {
  constructor(repository) {
    this.repository = repository;
  }

  create(payload, options) {
    const data = payload ?? {};
    if (typeof data.content !== 'string') throw new ValidationError('content est obligatoire');
    return this.repository.create(
      withoutUndefined({
        title: requiredText(data.title, 'title'),
        content: optionalText(data.content, 'content') ?? '',
        personId: optionalId(data.personId, 'personId'),
        status: oneOf(data.status ?? 'TODO', STATUSES, 'status'),
        priority: oneOf(data.priority ?? 'MEDIUM', PRIORITIES, 'priority'),
        dueDate: optionalDate(data.dueDate, 'dueDate'),
        objective: optionalText(data.objective, 'objective'),
        archives: optionalText(data.archives, 'archives'),
        result: optionalText(data.result, 'result'),
      }),
      options,
    );
  }

  list() {
    return this.repository.list();
  }

  get(id) {
    const research = this.repository.findDetailed(positiveId(id, 'Identifiant de recherche'));
    if (!research) throw new NotFoundError('Recherche introuvable');
    return research;
  }

  update(id, payload, options) {
    const researchId = positiveId(id, 'Identifiant de recherche');
    this.get(researchId);
    const data = payload ?? {};
    return this.repository.update(
      researchId,
      withoutUndefined({
        title: data.title === undefined ? undefined : requiredText(data.title, 'title'),
        content: optionalText(data.content, 'content'),
        personId: optionalId(data.personId, 'personId'),
        status: oneOf(data.status, STATUSES, 'status'),
        priority: oneOf(data.priority, PRIORITIES, 'priority'),
        dueDate: optionalDate(data.dueDate, 'dueDate'),
        objective: optionalText(data.objective, 'objective'),
        archives: optionalText(data.archives, 'archives'),
        result: optionalText(data.result, 'result'),
      }),
      options,
    );
  }

  remove(id, options) {
    if (!this.repository.remove(positiveId(id, 'Identifiant de recherche'), options)) {
      throw new NotFoundError('Recherche introuvable');
    }
  }

  addHypothesis(researchId, payload, options) {
    const id = positiveId(researchId, 'Identifiant de recherche');
    this.get(id);
    const data = payload ?? {};
    return this.repository.addHypothesis(
      id,
      {
        title: requiredText(data.title, 'title'),
        content: optionalText(data.content, 'content') ?? '',
        status: oneOf(data.status ?? 'OPEN', HYPOTHESIS_STATUSES, 'status'),
      },
      options,
    );
  }

  updateHypothesis(id, payload, options) {
    const hypothesisId = positiveId(id, 'Identifiant d’hypothèse');
    if (!this.repository.findHypothesis(hypothesisId)) {
      throw new NotFoundError('Hypothèse introuvable');
    }
    const data = payload ?? {};
    return this.repository.updateHypothesis(
      hypothesisId,
      withoutUndefined({
        title: data.title === undefined ? undefined : requiredText(data.title, 'title'),
        content: optionalText(data.content, 'content'),
        status: oneOf(data.status, HYPOTHESIS_STATUSES, 'status'),
      }),
      options,
    );
  }

  removeHypothesis(id, options) {
    if (!this.repository.removeHypothesis(positiveId(id, 'Identifiant d’hypothèse'), options)) {
      throw new NotFoundError('Hypothèse introuvable');
    }
  }

  addEvidence(hypothesisId, payload, options) {
    const id = positiveId(hypothesisId, 'Identifiant d’hypothèse');
    if (!this.repository.findHypothesis(id)) throw new NotFoundError('Hypothèse introuvable');
    const data = payload ?? {};
    return this.repository.addEvidence(
      id,
      {
        stance: oneOf(data.stance ?? 'SUPPORTS', STANCES, 'stance'),
        sourceId: optionalId(data.sourceId, 'sourceId') ?? null,
        content: requiredText(data.content, 'content', TEXT_MAX),
      },
      options,
    );
  }

  removeEvidence(id, options) {
    if (!this.repository.removeEvidence(positiveId(id, 'Identifiant de preuve'), options)) {
      throw new NotFoundError('Preuve introuvable');
    }
  }

  addTask(researchId, payload, options) {
    const id = positiveId(researchId, 'Identifiant de recherche');
    this.get(id);
    const data = payload ?? {};
    return this.repository.addTask(
      id,
      {
        title: requiredText(data.title, 'title'),
        content: optionalText(data.content, 'content') ?? null,
        status: oneOf(data.status ?? 'TODO', STATUSES, 'status'),
        priority: oneOf(data.priority ?? 'MEDIUM', PRIORITIES, 'priority'),
        dueDate: optionalDate(data.dueDate, 'dueDate') ?? null,
      },
      options,
    );
  }

  updateTask(id, payload, options) {
    const taskId = positiveId(id, 'Identifiant de tâche');
    if (!this.repository.findTask(taskId)) throw new NotFoundError('Tâche introuvable');
    const data = payload ?? {};
    return this.repository.updateTask(
      taskId,
      withoutUndefined({
        title: data.title === undefined ? undefined : requiredText(data.title, 'title'),
        content: optionalText(data.content, 'content'),
        status: oneOf(data.status, STATUSES, 'status'),
        priority: oneOf(data.priority, PRIORITIES, 'priority'),
        dueDate: optionalDate(data.dueDate, 'dueDate'),
      }),
      options,
    );
  }

  removeTask(id, options) {
    if (!this.repository.removeTask(positiveId(id, 'Identifiant de tâche'), options)) {
      throw new NotFoundError('Tâche introuvable');
    }
  }
}
