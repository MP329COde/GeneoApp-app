import { ValidationError } from '../errors.js';

const STATUSES = new Set(['TODO', 'IN_PROGRESS', 'DONE', 'ABANDONED']);
const PRIORITIES = new Set(['LOW', 'MEDIUM', 'HIGH']);

export class ResearchService {
  constructor(repository) {
    this.repository = repository;
  }

  create(payload, options) {
    const {
      title,
      content,
      personId = null,
      status = 'TODO',
      priority = 'MEDIUM',
      dueDate = null,
    } = payload ?? {};
    if (typeof title !== 'string' || title.trim() === '')
      throw new ValidationError('title est obligatoire');
    if (typeof content !== 'string') throw new ValidationError('content est obligatoire');
    if (!STATUSES.has(status)) throw new ValidationError('status invalide');
    if (!PRIORITIES.has(priority)) throw new ValidationError('priority invalide');
    return this.repository.create({ title, content, personId, status, priority, dueDate }, options);
  }

  list() {
    return this.repository.list();
  }
}
