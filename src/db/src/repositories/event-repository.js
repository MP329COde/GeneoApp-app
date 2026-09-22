import { withTransaction, recordAudit } from './base-repository.js';

export class EventRepository {
  constructor(database) {
    this.database = database;
  }

  /**
   * Crée un événement et ses participants dans une seule transaction.
   * participants: [{ personId, role }]
   */
  create(
    {
      type,
      dateText = null,
      datePrecision = 'UNKNOWN',
      placeId = null,
      notes = null,
      participants = [],
    },
    { performedBy = null } = {},
  ) {
    if (!type) {
      throw new Error('type est obligatoire');
    }

    return withTransaction(this.database, () => {
      const info = this.database
        .prepare(
          `INSERT INTO events (type, date_text, date_precision, place_id, notes)
           VALUES (@type, @dateText, @datePrecision, @placeId, @notes)`,
        )
        .run({ type, dateText, datePrecision, placeId, notes });

      const eventId = info.lastInsertRowid;
      recordAudit(this.database, {
        tableName: 'events',
        rowId: eventId,
        operation: 'INSERT',
        changes: { type, dateText, datePrecision, placeId, notes },
        performedBy,
      });

      for (const participant of participants) {
        this.addParticipant(eventId, participant, { performedBy });
      }

      return this.findById(eventId);
    });
  }

  addParticipant(eventId, { personId, role }, { performedBy = null } = {}) {
    return withTransaction(this.database, () => {
      const info = this.database
        .prepare(
          `INSERT INTO event_participants (event_id, person_id, role)
           VALUES (@eventId, @personId, @role)`,
        )
        .run({ eventId, personId, role });

      recordAudit(this.database, {
        tableName: 'event_participants',
        rowId: info.lastInsertRowid,
        operation: 'INSERT',
        changes: { eventId, personId, role },
        performedBy,
      });

      return info.lastInsertRowid;
    });
  }

  findById(id, { includeDeleted = false } = {}) {
    const clause = includeDeleted ? '' : 'AND deleted_at IS NULL';
    const event = this.database.prepare(`SELECT * FROM events WHERE id = ? ${clause}`).get(id);
    if (!event) return null;

    event.participants = this.database
      .prepare(
        `SELECT id, person_id AS personId, role
         FROM event_participants
         WHERE event_id = ? AND deleted_at IS NULL`,
      )
      .all(id);

    return event;
  }

  findForPerson(personId, { includeDeleted = false } = {}) {
    const clause = includeDeleted ? '' : 'AND e.deleted_at IS NULL';
    return this.database
      .prepare(
        `SELECT DISTINCT e.*
         FROM events e
         JOIN event_participants ep ON ep.event_id = e.id
         WHERE ep.person_id = ? AND ep.deleted_at IS NULL ${clause}
         ORDER BY e.date_text`,
      )
      .all(personId);
  }

  softDelete(id, { performedBy = null } = {}) {
    return withTransaction(this.database, () => {
      const existing = this.findById(id);
      if (!existing) {
        throw new Error(`Événement introuvable : ${id}`);
      }

      this.database
        .prepare(
          `UPDATE events SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ? AND deleted_at IS NULL`,
        )
        .run(id);

      recordAudit(this.database, {
        tableName: 'events',
        rowId: id,
        operation: 'DELETE',
        performedBy,
      });

      return true;
    });
  }

  restore(id, { performedBy = null } = {}) {
    return withTransaction(this.database, () => {
      const existing = this.findById(id, { includeDeleted: true });
      if (!existing || existing.deleted_at === null) {
        throw new Error(`Événement non supprimé ou introuvable : ${id}`);
      }

      this.database
        .prepare(
          `UPDATE events SET deleted_at = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ?`,
        )
        .run(id);

      recordAudit(this.database, {
        tableName: 'events',
        rowId: id,
        operation: 'RESTORE',
        performedBy,
      });

      return this.findById(id);
    });
  }
}
