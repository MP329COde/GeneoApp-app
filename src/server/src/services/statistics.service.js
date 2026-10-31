import { yearOf } from '../../../db/src/dates/genealogy-date.js';

const TOP = 5;

function pct(have, total) {
  return total > 0 ? Math.round((have / total) * 100) : 0;
}

function topCounts(map, limit = TOP) {
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'fr'))
    .slice(0, limit);
}

function bump(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

export class StatisticsService {
  constructor(database) {
    this.database = database;
  }

  totals() {
    const tables = ['persons', 'places', 'events', 'unions', 'parentages', 'sources', 'media'];
    return Object.fromEntries(
      tables.map((table) => [
        table,
        this.database
          .prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE deleted_at IS NULL`)
          .get().count,
      ]),
    );
  }

  /**
   * Indicateurs de lecture de l'arbre (tout est calculé localement) : sexe,
   * naissances par décennie, générations, lieux et noms les plus fréquents,
   * complétude des données et part des faits appuyés par une source.
   */
  insights() {
    const db = this.database;
    const persons = db
      .prepare(
        'SELECT id, given_names, family_name, sex, is_living FROM persons WHERE deleted_at IS NULL',
      )
      .all();
    const personIds = new Set(persons.map((person) => person.id));

    const bySex = { M: 0, F: 0, U: 0 };
    const surnames = new Map();
    const givenNames = new Map();
    let living = 0;
    for (const person of persons) {
      bySex[person.sex in bySex ? person.sex : 'U'] += 1;
      if (person.is_living) living += 1;
      const surname = person.family_name?.trim();
      if (surname) bump(surnames, surname);
      const given = person.given_names?.trim().split(/\s+/)[0];
      if (given) bump(givenNames, given);
    }

    // Naissances : première naissance datée de chaque personne.
    const births = db
      .prepare(
        `SELECT ep.person_id, e.date_text, e.place_id, pl.name AS place_name
         FROM event_participants ep
         JOIN events e ON e.id = ep.event_id AND e.deleted_at IS NULL AND e.type = 'BIRTH'
         LEFT JOIN places pl ON pl.id = e.place_id AND pl.deleted_at IS NULL
         WHERE ep.deleted_at IS NULL AND ep.role = 'PRINCIPAL'
         ORDER BY e.id`,
      )
      .all()
      .filter((row) => personIds.has(row.person_id));
    const withBirthDate = new Set();
    const withBirthPlace = new Set();
    const decades = new Map();
    const years = [];
    for (const row of births) {
      const year = row.date_text ? yearOf(row.date_text) : null;
      if (year !== null && !withBirthDate.has(row.person_id)) {
        withBirthDate.add(row.person_id);
        years.push(year);
        const decade = Math.floor(year / 10) * 10;
        decades.set(decade, (decades.get(decade) ?? 0) + 1);
      }
      if (row.place_name) withBirthPlace.add(row.person_id);
    }
    const decadeKeys = [...decades.keys()];
    const birthsByDecade = [];
    if (decadeKeys.length > 0) {
      for (let d = Math.min(...decadeKeys); d <= Math.max(...decadeKeys); d += 10) {
        birthsByDecade.push({ decade: d, count: decades.get(d) ?? 0 });
      }
    }

    // Lieux les plus cités par les événements.
    const placeRows = db
      .prepare(
        `SELECT pl.name AS name, COUNT(*) AS count
         FROM events e JOIN places pl ON pl.id = e.place_id AND pl.deleted_at IS NULL
         WHERE e.deleted_at IS NULL
         GROUP BY pl.id ORDER BY count DESC, pl.name LIMIT ${TOP}`,
      )
      .all();

    // Générations : rang de chaque personne = chaîne d'ascendants la plus longue.
    const parentages = db
      .prepare('SELECT child_id, parent_id FROM parentages WHERE deleted_at IS NULL')
      .all()
      .filter((row) => personIds.has(row.child_id) && personIds.has(row.parent_id));
    const parentsOf = new Map();
    for (const row of parentages) {
      if (!parentsOf.has(row.child_id)) parentsOf.set(row.child_id, []);
      parentsOf.get(row.child_id).push(row.parent_id);
    }
    const rank = new Map();
    const resolve = (id) => {
      if (rank.has(id)) return rank.get(id);
      rank.set(id, 0); // garde-fou contre un cycle de données incohérentes
      let best = 0;
      for (const parent of parentsOf.get(id) ?? []) best = Math.max(best, resolve(parent) + 1);
      rank.set(id, best);
      return best;
    };
    const perGeneration = [];
    for (const id of personIds) {
      const level = resolve(id);
      perGeneration[level] = (perGeneration[level] ?? 0) + 1;
    }
    const generations = Array.from(perGeneration, (count) => count ?? 0);
    const withParents = new Set(parentsOf.keys());

    // Sources : faits (événements) et sources effectivement citées.
    const eventTotal = db
      .prepare('SELECT COUNT(*) AS n FROM events WHERE deleted_at IS NULL')
      .get().n;
    const eventsCited = db
      .prepare(
        `SELECT COUNT(DISTINCT c.entity_id) AS n FROM citations c
         JOIN events e ON e.id = c.entity_id AND e.deleted_at IS NULL
         JOIN sources s ON s.id = c.source_id AND s.deleted_at IS NULL
         WHERE c.entity_type = 'EVENT' AND c.deleted_at IS NULL`,
      )
      .get().n;
    const sourceTotal = db
      .prepare('SELECT COUNT(*) AS n FROM sources WHERE deleted_at IS NULL')
      .get().n;
    const sourcesUsed = db
      .prepare(
        `SELECT COUNT(DISTINCT c.source_id) AS n FROM citations c
         JOIN sources s ON s.id = c.source_id AND s.deleted_at IS NULL
         WHERE c.deleted_at IS NULL`,
      )
      .get().n;
    const citedPersons = new Set(
      db
        .prepare(
          `SELECT DISTINCT c.entity_id AS id FROM citations c
           JOIN sources s ON s.id = c.source_id AND s.deleted_at IS NULL
           WHERE c.entity_type = 'PERSON' AND c.deleted_at IS NULL
           UNION
           SELECT DISTINCT ep.person_id FROM citations c
           JOIN sources s ON s.id = c.source_id AND s.deleted_at IS NULL
           JOIN event_participants ep ON ep.event_id = c.entity_id AND ep.deleted_at IS NULL
           WHERE c.entity_type = 'EVENT' AND c.deleted_at IS NULL`,
        )
        .all()
        .map((row) => row.id),
    );
    let sourcedPersons = 0;
    for (const id of personIds) if (citedPersons.has(id)) sourcedPersons += 1;

    const total = persons.length;
    const completeness = {
      birthDate: { have: withBirthDate.size, total },
      birthPlace: { have: withBirthPlace.size, total },
      parents: { have: withParents.size, total },
      sourced: { have: sourcedPersons, total },
    };
    for (const item of Object.values(completeness)) item.percent = pct(item.have, item.total);
    const completenessScore =
      total > 0
        ? Math.round(
            Object.values(completeness).reduce((sum, item) => sum + item.percent, 0) /
              Object.keys(completeness).length,
          )
        : 0;

    return {
      persons: { total, living, bySex },
      birthsByDecade,
      birthsDated: withBirthDate.size,
      birthSpan: years.length ? { from: Math.min(...years), to: Math.max(...years) } : null,
      generations: { count: generations.length, perGeneration: generations },
      topPlaces: placeRows,
      topSurnames: topCounts(surnames),
      topGivenNames: topCounts(givenNames),
      completeness: { ...completeness, score: completenessScore },
      evidence: {
        facts: eventTotal,
        factsCited: eventsCited,
        sources: sourceTotal,
        sourcesUsed,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  summary() {
    return { ...this.totals(), generatedAt: new Date().toISOString() };
  }
}
