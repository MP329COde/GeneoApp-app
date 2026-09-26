import { validateSearchQuery } from '../validation/schemas.js';
import { yearOf } from '../../../db/src/dates/genealogy-date.js';

// Échappe une requête utilisateur pour l'opérateur MATCH de FTS5 : chaque
// terme est traité comme un préfixe littéral entre guillemets, ce qui
// neutralise toute syntaxe FTS5 (colonnes, opérateurs booléens...) que
// l'utilisateur pourrait saisir involontairement.
function toFtsQuery(raw) {
  return raw
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => `"${term.replace(/"/g, '""')}"*`)
    .join(' ');
}

export class SearchService {
  constructor(repository, database) {
    this.repository = repository;
    this.database = database;
  }

  search(payload) {
    const { q, entityTypes, limit } = validateSearchQuery(payload);
    if (!q) return [];
    const results = this.repository.search(toFtsQuery(q), { entityTypes, limit });
    if (entityTypes && !entityTypes.includes('PERSON')) return results;

    const persons = this.database
      .prepare('SELECT id, given_names, family_name, notes FROM persons WHERE deleted_at IS NULL')
      .all();
    const query = normalize(q);
    const fuzzy = persons
      .map((person) => {
        const title = `${person.given_names} ${person.family_name}`;
        const normalizedTitle = normalize(title);
        const normalizedFamilyName = normalize(person.family_name);
        const score = Math.max(
          similarity(query, normalizedTitle),
          similarity(query, normalizedFamilyName),
          similarity(phonetic(query), phonetic(normalizedTitle)),
          similarity(phonetic(query), phonetic(normalizedFamilyName)),
        );
        return { person, title, score };
      })
      .filter(({ score }) => score >= 0.6)
      .sort((left, right) => right.score - left.score)
      .slice(0, limit)
      .map(({ person, title }) => ({
        entity_type: 'PERSON',
        entity_id: person.id,
        title,
        excerpt: person.notes ?? '',
        rank: 0,
      }));
    const existing = new Set(results.map((result) => `${result.entity_type}:${result.entity_id}`));
    return [
      ...results,
      ...fuzzy.filter((result) => !existing.has(`${result.entity_type}:${result.entity_id}`)),
    ].slice(0, limit);
  }

  // Écart maximal (en années) entre deux dates de naissance au-delà duquel
  // deux fiches ne peuvent raisonnablement être la même personne : au-delà,
  // la paire est exclue avant même le calcul du score (ex. « Jean Martin né
  // en 1600 » et « Jean Martin né en 1850 » ne sont jamais des doublons).
  static MAX_BIRTH_YEAR_GAP = 15;

  potentialDuplicates({ limit = 100 } = {}) {
    const persons = this.database
      .prepare(
        'SELECT id, given_names, family_name, birth_family_name FROM persons WHERE deleted_at IS NULL ORDER BY id',
      )
      .all();
    if (persons.length < 2) return [];

    const birthYearByPerson = new Map();
    const deathYearByPerson = new Map();
    const birthPlaceByPerson = new Map();
    const eventRows = this.database
      .prepare(
        `SELECT ep.person_id AS personId, e.type, e.date_text AS dateText,
                pl.normalized_name AS place
         FROM event_participants ep
         JOIN events e ON e.id = ep.event_id AND e.deleted_at IS NULL
         LEFT JOIN places pl ON pl.id = e.place_id AND pl.deleted_at IS NULL
         WHERE ep.deleted_at IS NULL
           AND ep.role = 'PRINCIPAL'
           AND e.type IN ('BIRTH', 'DEATH')`,
      )
      .all();
    for (const row of eventRows) {
      if (row.type === 'BIRTH') {
        if (!birthYearByPerson.has(row.personId)) {
          birthYearByPerson.set(row.personId, yearOf(row.dateText));
        }
        if (row.place && !birthPlaceByPerson.has(row.personId)) {
          birthPlaceByPerson.set(row.personId, row.place);
        }
      } else if (row.type === 'DEATH' && !deathYearByPerson.has(row.personId)) {
        deathYearByPerson.set(row.personId, yearOf(row.dateText));
      }
    }

    const parentsByChild = new Map();
    for (const { child_id: childId, parent_id: parentId } of this.database
      .prepare('SELECT child_id, parent_id FROM parentages WHERE deleted_at IS NULL')
      .all()) {
      if (!parentsByChild.has(childId)) parentsByChild.set(childId, new Set());
      parentsByChild.get(childId).add(parentId);
    }

    // Pré-normalisation de chaque personne une seule fois (et non par paire).
    const prepared = persons.map((person) => ({
      person,
      fullName: normalize(`${person.given_names} ${person.family_name}`),
      birthName: person.birth_family_name ? normalize(person.birth_family_name) : null,
      familyPhonetic: phonetic(person.family_name),
      givenInitial: normalize(person.given_names).charAt(0) || '?',
      birthYear: birthYearByPerson.get(person.id) ?? null,
      deathYear: deathYearByPerson.get(person.id) ?? null,
      birthPlace: birthPlaceByPerson.get(person.id) ?? null,
      parents: parentsByChild.get(person.id) ?? null,
    }));

    // Regroupement par clé phonétique du nom de famille + initiale du
    // prénom : deux personnes ne peuvent être comparées que si elles
    // partagent ce groupe, ce qui évite la comparaison exhaustive O(n²).
    const groups = new Map();
    for (const item of prepared) {
      const key = `${item.familyPhonetic}:${item.givenInitial}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }

    const results = [];
    for (const group of groups.values()) {
      for (let leftIndex = 0; leftIndex < group.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < group.length; rightIndex += 1) {
          const left = group[leftIndex];
          const right = group[rightIndex];
          if (
            left.birthYear !== null &&
            right.birthYear !== null &&
            Math.abs(left.birthYear - right.birthYear) > SearchService.MAX_BIRTH_YEAR_GAP
          ) {
            continue;
          }
          const score = duplicateScore(left, right);
          if (score < 0.6) continue;
          results.push({
            persons: [left.person, right.person],
            score: Math.round(score * 100),
            requiresValidation: true,
          });
        }
      }
    }
    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}

// Score combinant : nom (et nom de naissance), dates de naissance/décès
// (un écart de plus de MAX_BIRTH_YEAR_GAP ans exclut la paire), lieu de
// naissance commun, et parents communs — plutôt que le seul nom.
function duplicateScore(left, right) {
  const nameScore = similarity(left.fullName, right.fullName);
  const birthNameScore =
    left.birthName && right.birthName ? similarity(left.birthName, right.birthName) : 0;
  let score = nameScore * 0.75 + birthNameScore * 0.1;

  if (left.birthYear !== null && right.birthYear !== null) {
    const gap = Math.abs(left.birthYear - right.birthYear);
    if (gap > SearchService.MAX_BIRTH_YEAR_GAP) return 0;
    score += (1 - gap / SearchService.MAX_BIRTH_YEAR_GAP) * 0.1;
  }
  if (left.deathYear !== null && right.deathYear !== null) {
    const gap = Math.abs(left.deathYear - right.deathYear);
    if (gap <= SearchService.MAX_BIRTH_YEAR_GAP) {
      score += (1 - gap / SearchService.MAX_BIRTH_YEAR_GAP) * 0.05;
    }
  }
  if (left.birthPlace && right.birthPlace && left.birthPlace === right.birthPlace) {
    score += 0.05;
  }
  if (left.parents?.size && right.parents?.size) {
    const sharesParent = [...left.parents].some((id) => right.parents.has(id));
    if (sharesParent) score += 0.05;
  }
  return Math.min(1, score);
}

export function normalize(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function phonetic(value) {
  return normalize(value)
    .replace(/[aeiouy]/g, '')
    .replace(/[bp]/g, 'p')
    .replace(/[dt]/g, 't')
    .replace(/[ckq]/g, 'k')
    .replace(/[sz]/g, 's');
}

export function similarity(left, right) {
  if (left === right) return 1;
  const distance = levenshtein(left, right);
  return 1 - distance / Math.max(left.length, right.length, 1);
}

function levenshtein(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}
