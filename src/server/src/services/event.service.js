import { NotFoundError } from '../errors.js';
import { assertId, validateEventCreate, validateParticipantAdd } from '../validation/schemas.js';

export class EventService {
  constructor(repository) {
    this.repository = repository;
  }

  create(payload, options) {
    const data = validateEventCreate(payload);
    return this.repository.create(data, options);
  }

  get(id) {
    assertId(id);
    const event = this.repository.findById(id);
    if (!event) throw new NotFoundError(`Événement introuvable : ${id}`);
    return event;
  }

  listForPerson(personId) {
    assertId(personId, 'personId');
    return this.repository.findForPerson(personId);
  }

  addParticipant(eventId, payload, options) {
    assertId(eventId, 'eventId');
    const existing = this.repository.findById(eventId);
    if (!existing) throw new NotFoundError(`Événement introuvable : ${eventId}`);
    const data = validateParticipantAdd(payload);
    return this.repository.addParticipant(eventId, data, options);
  }

  remove(id, options) {
    assertId(id);
    const existing = this.repository.findById(id);
    if (!existing) throw new NotFoundError(`Événement introuvable : ${id}`);
    return this.repository.softDelete(id, options);
  }

  restore(id, options) {
    assertId(id);
    const existing = this.repository.findById(id, { includeDeleted: true });
    if (!existing || existing.deleted_at === null) {
      throw new NotFoundError(`Événement non supprimé ou introuvable : ${id}`);
    }
    return this.repository.restore(id, options);
  }
}
