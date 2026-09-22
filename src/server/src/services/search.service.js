import { validateSearchQuery } from '../validation/schemas.js';

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

  potentialDuplicates({ limit = 100 } = {}) {
    const persons = this.database
      .prepare(
        'SELECT id, given_names, family_name, birth_family_name FROM persons WHERE deleted_at IS NULL ORDER BY id',
      )
      .all();
    const results = [];
    for (let leftIndex = 0; leftIndex < persons.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < persons.length; rightIndex += 1) {
        const left = persons[leftIndex];
        const right = persons[rightIndex];
        const score = duplicateScore(left, right);
        if (score < 0.6) continue;
        results.push({
          persons: [left, right],
          score: Math.round(score * 100),
          requiresValidation: true,
        });
      }
    }
    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}

function duplicateScore(left, right) {
  const leftName = normalize(`${left.given_names} ${left.family_name}`);
  const rightName = normalize(`${right.given_names} ${right.family_name}`);
  const nameScore = similarity(leftName, rightName);
  const birthNameScore =
    left.birth_family_name && right.birth_family_name
      ? similarity(normalize(left.birth_family_name), normalize(right.birth_family_name))
      : 0;
  return Math.min(1, nameScore * 0.85 + birthNameScore * 0.15);
}

function normalize(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function phonetic(value) {
  return normalize(value)
    .replace(/[aeiouy]/g, '')
    .replace(/[bp]/g, 'p')
    .replace(/[dt]/g, 't')
    .replace(/[ckq]/g, 'k')
    .replace(/[sz]/g, 's');
}

function similarity(left, right) {
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
