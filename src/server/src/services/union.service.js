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

  /**
   * Fiche famille : l'union, ses partenaires, ses enfants (filiations rattachées
   * à cette union, une entrée par enfant avec la nature de chaque lien) et les
   * événements de début et de fin. Les enfants rattachés à d'autres parents
   * restent dans leur propre famille (familles recomposées).
   */
  family(id) {
    const union = this.get(id);
    const database = this.repository.database;
    const person = database.prepare('SELECT * FROM persons WHERE id = ? AND deleted_at IS NULL');
    const event = database.prepare('SELECT * FROM events WHERE id = ? AND deleted_at IS NULL');
    const children = new Map();
    for (const row of database
      .prepare(
        `SELECT child_id, parent_id, parent_role, link_type FROM parentages
         WHERE union_id = ? AND deleted_at IS NULL ORDER BY id`,
      )
      .all(id)) {
      const child = person.get(row.child_id);
      if (!child) continue;
      if (!children.has(row.child_id)) children.set(row.child_id, { ...child, links: [] });
      children.get(row.child_id).links.push({
        parentId: row.parent_id,
        parentRole: row.parent_role,
        linkType: row.link_type,
      });
    }
    return {
      union,
      partners: union.partnerIds.map((personId) => person.get(personId)).filter(Boolean),
      children: [...children.values()],
      startEvent: union.start_event_id ? (event.get(union.start_event_id) ?? null) : null,
      endEvent: union.end_event_id ? (event.get(union.end_event_id) ?? null) : null,
    };
  }

  /** Familles d'une personne : comme partenaire, et comme enfant (unions de ses parents). */
  familiesOfPerson(personId) {
    assertId(personId, 'personId');
    const database = this.repository.database;
    const asChild = database
      .prepare(
        `SELECT DISTINCT union_id FROM parentages
         WHERE child_id = ? AND union_id IS NOT NULL AND deleted_at IS NULL`,
      )
      .all(personId)
      .map((row) => row.union_id);
    return {
      asPartner: this.repository.findForPerson(personId).map((union) => union.id),
      asChild,
    };
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
