import { withTransaction, recordAudit } from './base-repository.js';
import { compareGenealogyDates } from '../dates/genealogy-date.js';
import { shouldBeDeceased } from '../genealogy/living-status.js';

// Tri chronologique réel (« vers 1812 », « 03 MAR 1788 », intervalles…),
// dates inconnues en dernier, puis ordre de saisie.
function byGenealogicalDate(a, b) {
  return compareGenealogyDates(a.date_text ?? '', b.date_text ?? '') || a.id - b.id;
}

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
      value = null,
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
          `INSERT INTO events (type, value, date_text, date_precision, place_id, notes)
           VALUES (@type, @value, @dateText, @datePrecision, @placeId, @notes)`,
        )
        .run({ type, value, dateText, datePrecision, placeId, notes });

      const eventId = info.lastInsertRowid;
      recordAudit(this.database, {
        tableName: 'events',
        rowId: eventId,
        operation: 'INSERT',
        changes: { type, value, dateText, datePrecision, placeId, notes },
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

      // Un décès/inhumation enregistré, ou une naissance/baptême de plus de
      // 110 ans sans décès connu, rend la personne présumée non-vivante
      // (le statut « vivant » par défaut ne doit pas contredire les faits).
      if (role === 'PRINCIPAL') {
        const event = this.database
          .prepare('SELECT type, date_text AS dateText FROM events WHERE id = ?')
          .get(eventId);
        const ownEvents = this.findForPerson(personId).map((row) => ({
          type: row.type,
          dateText: row.date_text,
        }));
        if (event && shouldBeDeceased([...ownEvents, event])) {
          const updated = this.database
            .prepare('UPDATE persons SET is_living = 0 WHERE id = ? AND is_living = 1')
            .run(personId);
          if (updated.changes > 0) {
            recordAudit(this.database, {
              tableName: 'persons',
              rowId: personId,
              operation: 'UPDATE',
              changes: {
                isLiving: false,
                reason: 'décès enregistré ou naissance de plus de 110 ans',
              },
              performedBy,
            });
          }
        }
      }

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

  // Tous les événements réels de l'arbre, triés chronologiquement selon la
  // lecture généalogique de date_text (voir dates/genealogy-date.js) — alimente la vue
  // chronologie. Chaque événement porte ses participants et le nom du lieu
  // déjà résolu, pour éviter des allers-retours N+1 côté appelant.
  listAll({ includeDeleted = false } = {}) {
    const clause = includeDeleted ? '' : 'WHERE e.deleted_at IS NULL';
    const events = this.database
      .prepare(
        `SELECT e.*, p.name AS place_name
         FROM events e
         LEFT JOIN places p ON p.id = e.place_id
         ${clause}`,
      )
      .all()
      .sort(byGenealogicalDate);

    const participantsByEvent = this.database
      .prepare(
        `SELECT ep.event_id, ep.person_id AS personId, ep.role,
                pe.given_names AS personGivenNames, pe.family_name AS personFamilyName
         FROM event_participants ep
         JOIN persons pe ON pe.id = ep.person_id
         WHERE ep.deleted_at IS NULL`,
      )
      .all()
      .reduce((byEvent, row) => {
        (byEvent[row.event_id] ??= []).push(row);
        return byEvent;
      }, {});

    return events.map((event) => ({
      ...event,
      participants: participantsByEvent[event.id] ?? [],
    }));
  }

  findForPerson(personId, { includeDeleted = false } = {}) {
    const clause = includeDeleted ? '' : 'AND e.deleted_at IS NULL';
    return this.database
      .prepare(
        `SELECT DISTINCT e.*
         FROM events e
         JOIN event_participants ep ON ep.event_id = e.id
         WHERE ep.person_id = ? AND ep.deleted_at IS NULL ${clause}`,
      )
      .all(personId)
      .sort(byGenealogicalDate);
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
