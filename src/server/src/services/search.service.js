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
  constructor(repository) {
    this.repository = repository;
  }

  search(payload) {
    const { q, entityTypes, limit } = validateSearchQuery(payload);
    if (!q) return [];
    return this.repository.search(toFtsQuery(q), { entityTypes, limit });
  }
}
