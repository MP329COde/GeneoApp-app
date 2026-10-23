import { invalidError } from '../validation/field-errors.js';
import { EVENT_TYPES as KNOWN_EVENT_TYPES } from '../validation/schemas.js';
import { PlaceRepository } from '../../../db/src/repositories/place-repository.js';
import { normalize, phonetic, similarity } from './search.service.js';
import { parseGenealogyDate, yearOf } from '../../../db/src/dates/genealogy-date.js';

const EVENT_TYPES = new Set(KNOWN_EVENT_TYPES);
const MAX_RESULTS = 200;
const FUZZY_THRESHOLD = 0.75;

function text(value, field, max = 120) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > max) {
    throw invalidError(field);
  }
  return value.trim() || null;
}

function year(value, field) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 100 || number > 2999) {
    throw invalidError(field, `${field} doit être une année`);
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

function coordinate(value, field, limit) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || Math.abs(number) > limit) {
    throw invalidError(field, `${field} doit être une coordonnée valide`);
  }
  return number;
}

// Zone géographique : rectangle (south/north/west/east) ou disque (latitude,
// longitude, radiusKm). Renvoie null si aucune zone n'est demandée.
function geography(payload) {
  const box = payload.bbox;
  const near = payload.near;
  if (box && near) throw invalidError('near', 'Choisir un rectangle ou un rayon, pas les deux');
  if (box) {
    const area = {
      kind: 'BOX',
      south: coordinate(box.south, 'bbox.south', 90),
      north: coordinate(box.north, 'bbox.north', 90),
      west: coordinate(box.west, 'bbox.west', 180),
      east: coordinate(box.east, 'bbox.east', 180),
    };
    if ([area.south, area.north, area.west, area.east].some((v) => v === null)) {
      throw invalidError('bbox', 'bbox requiert south, north, west et east');
    }
    if (area.south > area.north) throw invalidError('bbox', 'bbox : south dépasse north');
    return area;
  }
  if (near) {
    const area = {
      kind: 'RADIUS',
      latitude: coordinate(near.latitude, 'near.latitude', 90),
      longitude: coordinate(near.longitude, 'near.longitude', 180),
      radiusKm: Number(near.radiusKm),
    };
    if (area.latitude === null || area.longitude === null) {
      throw invalidError('near', 'near requiert latitude et longitude');
    }
    if (!Number.isFinite(area.radiusKm) || area.radiusKm <= 0 || area.radiusKm > 20000) {
      throw invalidError('near.radiusKm', 'radiusKm doit être positif');
    }
    return area;
  }
  return null;
}

function distanceKm(latA, lonA, latB, lonB) {
  const rad = (degrees) => (degrees * Math.PI) / 180;
  const a =
    Math.sin(rad(latB - latA) / 2) ** 2 +
    Math.cos(rad(latA)) * Math.cos(rad(latB)) * Math.sin(rad(lonB - lonA) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

function inArea(area, latitude, longitude) {
  if (latitude === null || longitude === null) return false;
  if (area.kind === 'BOX') {
    const lonOk =
      area.west <= area.east
        ? longitude >= area.west && longitude <= area.east
        : longitude >= area.west || longitude <= area.east; // zone à cheval sur l'antiméridien
    return latitude >= area.south && latitude <= area.north && lonOk;
  }
  return distanceKm(area.latitude, area.longitude, latitude, longitude) <= area.radiusKm;
}

/**
 * Recherche généalogique multicritère : nom, prénom (flou/phonétique),
 * sexe, lieu, période (années, dates approximatives comprises), type
 * d'événement, source citée, identifiant ou identifiant externe.
 */
export class AdvancedSearchService {
  constructor(database) {
    this.database = database;
    this.places = new PlaceRepository(database);
  }

  search(payload = {}) {
    const filters = {
      familyName: text(payload.familyName, 'familyName'),
      givenNames: text(payload.givenNames, 'givenNames'),
      place: text(payload.place, 'place'),
      source: text(payload.source, 'source'),
      identifier: text(payload.identifier, 'identifier', 64),
      occupation: text(payload.occupation, 'occupation'),
      note: text(payload.note, 'note', 200),
      yearFrom: year(payload.yearFrom, 'yearFrom'),
      yearTo: year(payload.yearTo, 'yearTo'),
      eventType: payload.eventType ? String(payload.eventType) : null,
      sex: payload.sex ? String(payload.sex) : null,
      fuzzy: payload.fuzzy !== false && payload.fuzzy !== 'false',
    };
    if (filters.eventType && !EVENT_TYPES.has(filters.eventType)) {
      throw invalidError('eventType', 'Type d’événement invalide');
    }
    if (filters.sex && !['M', 'F', 'U'].includes(filters.sex)) {
      throw invalidError('sex', 'Sexe invalide');
    }
    if (filters.yearFrom && filters.yearTo && filters.yearFrom > filters.yearTo) {
      throw invalidError('yearTo', 'La période est inversée');
    }
    const area = geography(payload);
    const active =
      area !== null ||
      Object.entries(filters).some(([key, value]) => key !== 'fuzzy' && value !== null);
    if (!active) return { results: [], total: 0, filters };

    const persons = this.database.prepare('SELECT * FROM persons WHERE deleted_at IS NULL').all();
    const events = this.database
      .prepare(
        `SELECT e.id, e.type, e.value, e.notes, e.date_text, e.place_id,
                pl.name AS place_name, pl.latitude, pl.longitude, ep.person_id
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
    const identifiersByPerson = new Map();
    if (filters.identifier) {
      for (const row of this.database
        .prepare('SELECT person_id, value FROM person_identifiers WHERE deleted_at IS NULL')
        .all()) {
        if (!identifiersByPerson.has(row.person_id)) identifiersByPerson.set(row.person_id, []);
        identifiersByPerson.get(row.person_id).push(row.value);
      }
    }
    const notesByPerson = new Map();
    if (filters.note) {
      for (const row of this.database
        .prepare(
          `SELECT entity_id, title, body FROM notes
           WHERE entity_type = 'PERSON' AND deleted_at IS NULL`,
        )
        .all()) {
        if (!notesByPerson.has(row.entity_id)) notesByPerson.set(row.entity_id, []);
        notesByPerson.get(row.entity_id).push(`${row.title ?? ''} ${row.body}`);
      }
    }
    // Lieu : nom courant, noms historiques et lieux englobants (« Yvelines »
    // retrouve un événement à Versailles), tels qu'ils étaient l'année de
    // l'événement. Résolu une fois par couple (lieu, année).
    const placeLabels = new Map();
    const placeLabel = (event) => {
      if (!event.place_id) return '';
      const key = `${event.place_id}:${event.year ?? ''}`;
      if (!placeLabels.has(key)) {
        const resolved = this.places.resolveAt(event.place_id, event.year);
        const historical = this.places.listNames(event.place_id).map((item) => item.name);
        placeLabels.set(
          key,
          [resolved?.fullName ?? event.place_name, event.place_name, ...historical].join(' | '),
        );
      }
      return placeLabels.get(key);
    };
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
        const known = [person.external_id ?? '', ...(identifiersByPerson.get(person.id) ?? [])];
        if (String(person.id) !== id && !known.some((value) => normalize(value) === normalize(id)))
          continue;
      }
      const familyScore = filters.familyName
        ? Math.max(
            nameScore(filters.familyName, person.family_name, filters.fuzzy),
            nameScore(filters.familyName, person.birth_family_name, filters.fuzzy),
            nameScore(filters.familyName, person.married_name, filters.fuzzy),
            nameScore(filters.familyName, person.alias, filters.fuzzy),
          )
        : 1;
      if (familyScore < (filters.fuzzy ? FUZZY_THRESHOLD : 0.9)) continue;
      const givenScore = filters.givenNames
        ? Math.max(
            nameScore(filters.givenNames, person.given_names, filters.fuzzy),
            nameScore(filters.givenNames, person.nickname, filters.fuzzy),
            nameScore(filters.givenNames, person.alias, filters.fuzzy),
          )
        : 1;
      if (givenScore < (filters.fuzzy ? FUZZY_THRESHOLD : 0.9)) continue;

      // Événements retenus : ceux qui satisfont ensemble type, lieu et période.
      const personEvents = eventsByPerson.get(person.id) ?? [];
      const eventFilter =
        filters.eventType ||
        filters.place ||
        filters.yearFrom ||
        filters.yearTo ||
        filters.occupation ||
        area;
      const matched = personEvents.filter((event) => {
        if (filters.eventType && event.type !== filters.eventType) return false;
        if (filters.place && !normalize(placeLabel(event)).includes(normalize(filters.place)))
          return false;
        if (filters.yearFrom && (event.year === null || event.year < filters.yearFrom))
          return false;
        if (filters.yearTo && (event.year === null || event.year > filters.yearTo)) return false;
        if (
          filters.occupation &&
          !(
            event.type === 'OCCUPATION' &&
            normalize(event.value ?? '').includes(normalize(filters.occupation))
          )
        )
          return false;
        if (area && !inArea(area, event.latitude, event.longitude)) return false;
        return true;
      });
      if (eventFilter && matched.length === 0) continue;
      if (filters.note) {
        const wanted = normalize(filters.note);
        const haystack = [
          person.notes ?? '',
          ...(notesByPerson.get(person.id) ?? []),
          ...personEvents.map((event) => event.notes ?? ''),
        ];
        if (!haystack.some((entry) => normalize(entry).includes(wanted))) continue;
      }
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
          .map(({ id, type, value, date_text: dateText, place_name: place }) => ({
            id,
            type,
            value,
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
