import { ValidationError } from '../errors.js';
import { normalize, phonetic, similarity } from './search.service.js';
import { parseGenealogyDate, yearOf } from '../../../db/src/dates/genealogy-date.js';

const EVENT_TYPES = new Set([
  'BIRTH',
  'DEATH',
  'MARRIAGE',
  'DIVORCE',
  'BAPTISM',
  'BURIAL',
  'ADOPTION',
  'OTHER',
]);
const MAX_RESULTS = 200;
const FUZZY_THRESHOLD = 0.75;

function text(value, field, max = 120) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > max) {
    throw new ValidationError(`${field} invalide`, { fields: { [field]: 'invalide' } });
  }
  return value.trim() || null;
}

function year(value, field) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 100 || number > 2999) {
    throw new ValidationError(`${field} doit être une année`, { fields: { [field]: 'invalide' } });
  }
  return number;
}

// Correspondance d'un nom : exacte, sous-chaîne, puis floue et phonétique
// (Dupont / Dupond / Dupon) si demandé.
function nameScore(query, candidate, fuzzy) {
  if (!query) return 1;
  const q = normalize(query);
  const c = normalize(candidate ?? '');
  if (!c) return 0;
  if (c === q) return 1;
  if (c.includes(q)) return 0.95;
  if (!fuzzy) return 0;
  const words = c.split(' ');
  return Math.max(
    similarity(q, c),
    similarity(phonetic(q), phonetic(c)),
    ...words.map((word) => Math.max(similarity(q, word), similarity(phonetic(q), phonetic(word)))),
  );
}

/**
 * Recherche généalogique multicritère : nom, prénom (flou/phonétique),
 * sexe, lieu, période (années, dates approximatives comprises), type
 * d'événement, source citée, identifiant ou identifiant externe.
 */
export class AdvancedSearchService {
  constructor(database) {
    this.database = database;
  }

  search(payload = {}) {
    const filters = {
      familyName: text(payload.familyName, 'familyName'),
      givenNames: text(payload.givenNames, 'givenNames'),
      place: text(payload.place, 'place'),
      source: text(payload.source, 'source'),
      identifier: text(payload.identifier, 'identifier', 64),
      yearFrom: year(payload.yearFrom, 'yearFrom'),
      yearTo: year(payload.yearTo, 'yearTo'),
      eventType: payload.eventType ? String(payload.eventType) : null,
      sex: payload.sex ? String(payload.sex) : null,
      fuzzy: payload.fuzzy !== false && payload.fuzzy !== 'false',
    };
    if (filters.eventType && !EVENT_TYPES.has(filters.eventType)) {
      throw new ValidationError('Type d’événement invalide', { fields: { eventType: 'invalide' } });
    }
    if (filters.sex && !['M', 'F', 'U'].includes(filters.sex)) {
      throw new ValidationError('Sexe invalide', { fields: { sex: 'invalide' } });
    }
    if (filters.yearFrom && filters.yearTo && filters.yearFrom > filters.yearTo) {
      throw new ValidationError('La période est inversée', { fields: { yearTo: 'invalide' } });
    }
    const active = Object.entries(filters).some(
      ([key, value]) => key !== 'fuzzy' && value !== null,
    );
    if (!active) return { results: [], total: 0, filters };

    const persons = this.database.prepare('SELECT * FROM persons WHERE deleted_at IS NULL').all();
    const events = this.database
      .prepare(
        `SELECT e.id, e.type, e.date_text, pl.name AS place_name, ep.person_id
         FROM events e
         JOIN event_participants ep ON ep.event_id = e.id AND ep.deleted_at IS NULL
         LEFT JOIN places pl ON pl.id = e.place_id
         WHERE e.deleted_at IS NULL`,
      )
      .all();
    const eventsByPerson = new Map();
    for (const event of events) {
      if (!eventsByPerson.has(event.person_id)) eventsByPerson.set(event.person_id, []);
      eventsByPerson
        .get(event.person_id)
        .push({ ...event, year: yearOf(parseGenealogyDate(event.date_text ?? '')) });
    }
    const sourcesByPerson = new Map();
    if (filters.source) {
      const rows = this.database
        .prepare(
          `SELECT c.entity_type, c.entity_id, s.title, s.author, c.page
           FROM citations c JOIN sources s ON s.id = c.source_id AND s.deleted_at IS NULL
           WHERE c.deleted_at IS NULL`,
        )
        .all();
      const eventOwners = new Map();
      for (const event of events) {
        if (!eventOwners.has(event.id)) eventOwners.set(event.id, []);
        eventOwners.get(event.id).push(event.person_id);
      }
      for (const row of rows) {
        const owners =
          row.entity_type === 'PERSON'
            ? [row.entity_id]
            : row.entity_type === 'EVENT'
              ? (eventOwners.get(row.entity_id) ?? [])
              : [];
        for (const owner of owners) {
          if (!sourcesByPerson.has(owner)) sourcesByPerson.set(owner, []);
          sourcesByPerson.get(owner).push(`${row.title} ${row.author ?? ''} ${row.page ?? ''}`);
        }
      }
    }

    const results = [];
    for (const person of persons) {
      if (filters.sex && person.sex !== filters.sex) continue;
      if (filters.identifier) {
        const id = filters.identifier.replace(/^#/, '');
        if (String(person.id) !== id && normalize(person.external_id ?? '') !== normalize(id))
          continue;
      }
      const familyScore = filters.familyName
        ? Math.max(
            nameScore(filters.familyName, person.family_name, filters.fuzzy),
            nameScore(filters.familyName, person.birth_family_name, filters.fuzzy),
            nameScore(filters.familyName, person.married_name, filters.fuzzy),
          )
        : 1;
      if (familyScore < (filters.fuzzy ? FUZZY_THRESHOLD : 0.9)) continue;
      const givenScore = filters.givenNames
        ? Math.max(
            nameScore(filters.givenNames, person.given_names, filters.fuzzy),
            nameScore(filters.givenNames, person.nickname, filters.fuzzy),
          )
        : 1;
      if (givenScore < (filters.fuzzy ? FUZZY_THRESHOLD : 0.9)) continue;

      // Événements retenus : ceux qui satisfont ensemble type, lieu et période.
      const personEvents = eventsByPerson.get(person.id) ?? [];
      const eventFilter = filters.eventType || filters.place || filters.yearFrom || filters.yearTo;
      const matched = personEvents.filter((event) => {
        if (filters.eventType && event.type !== filters.eventType) return false;
        if (filters.place && !normalize(event.place_name ?? '').includes(normalize(filters.place)))
          return false;
        if (filters.yearFrom && (event.year === null || event.year < filters.yearFrom))
          return false;
        if (filters.yearTo && (event.year === null || event.year > filters.yearTo)) return false;
        return true;
      });
      if (eventFilter && matched.length === 0) continue;
      if (filters.source) {
        const cited = sourcesByPerson.get(person.id) ?? [];
        if (!cited.some((entry) => normalize(entry).includes(normalize(filters.source)))) continue;
      }
      results.push({
        person: {
          id: person.id,
          given_names: person.given_names,
          family_name: person.family_name,
          sex: person.sex,
          external_id: person.external_id,
        },
        score: Math.round(familyScore * givenScore * 100) / 100,
        matchedEvents: matched
          .slice(0, 5)
          .map(({ id, type, date_text: dateText, place_name: place }) => ({
            id,
            type,
            dateText,
            place,
          })),
      });
    }
    results.sort(
      (a, b) =>
        b.score - a.score ||
        a.person.family_name.localeCompare(b.person.family_name, 'fr') ||
        a.person.given_names.localeCompare(b.person.given_names, 'fr'),
    );
    return { results: results.slice(0, MAX_RESULTS), total: results.length, filters };
  }
}
