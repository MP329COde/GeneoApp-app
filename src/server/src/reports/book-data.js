// Collecte des données du livre généalogique : périmètre (ascendants /
// descendants d'une personne, ou arbre entier), confidentialité, fiches,
// sources citées. Lecture seule : rien n'est écrit en base.

import { shouldBeDeceased } from '../../../db/src/genealogy/living-status.js';
import { yearOf } from '../../../db/src/dates/genealogy-date.js';
import { NotFoundError, ValidationError } from '../errors.js';
import { invalidError } from '../validation/field-errors.js';
import { bookLabels, fill } from './book-labels.js';
import { readJpegInfo } from './pdf-writer.js';

export const MAX_GENERATIONS = 20;
export const DEFAULT_GENERATIONS = 4;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

const DIRECTIONS = ['both', 'ancestors', 'descendants'];

export function normalizeBookOptions(input = {}) {
  const body = input ?? {};
  const locale = body.locale === 'en' ? 'en' : 'fr';
  let rootPersonId = null;
  if (body.rootPersonId !== undefined && body.rootPersonId !== null && body.rootPersonId !== '') {
    rootPersonId = Number(body.rootPersonId);
    if (!Number.isInteger(rootPersonId) || rootPersonId <= 0) throw invalidError('rootPersonId');
  }
  const direction = body.direction ?? 'both';
  if (!DIRECTIONS.includes(direction)) {
    throw invalidError('direction', 'direction doit valoir both, ancestors ou descendants', {
      allowed: DIRECTIONS.join(', '),
    });
  }
  const generations = body.generations ?? DEFAULT_GENERATIONS;
  if (!Number.isInteger(generations) || generations < 0 || generations > MAX_GENERATIONS) {
    throw invalidError('generations', `generations doit être un entier de 0 à ${MAX_GENERATIONS}`, {
      max: MAX_GENERATIONS,
    });
  }
  if (body.includeLiving !== undefined && typeof body.includeLiving !== 'boolean') {
    throw invalidError('includeLiving', 'includeLiving doit être un booléen');
  }
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 120) : '';
  return {
    locale,
    rootPersonId,
    direction,
    generations,
    // Confidentialité : par défaut, les personnes vivantes ou privées sont masquées.
    includeLiving: body.includeLiving === true,
    title,
  };
}

const nameOf = (person) =>
  [person.title, person.given_names, person.family_name, person.suffix]
    .filter((part) => part && String(part).trim())
    .join(' ');

export class BookData {
  constructor(database, { readMedia } = {}) {
    this.database = database;
    this.readMedia = readMedia;
  }

  all(sql, ...params) {
    return this.database.prepare(sql).all(...params);
  }

  async collect(rawOptions) {
    const options = normalizeBookOptions(rawOptions);
    const labels = bookLabels(options.locale);
    const persons = this.all('SELECT * FROM persons WHERE deleted_at IS NULL ORDER BY id');
    const byId = new Map(persons.map((person) => [person.id, person]));

    const personEvents = this.all(
      `SELECT ep.person_id, ep.role, e.* FROM event_participants ep
       JOIN events e ON e.id = ep.event_id AND e.deleted_at IS NULL
       WHERE ep.deleted_at IS NULL
       ORDER BY e.id`,
    );
    const eventsByPerson = new Map();
    for (const row of personEvents) {
      if (!eventsByPerson.has(row.person_id)) eventsByPerson.set(row.person_id, []);
      eventsByPerson.get(row.person_id).push({ ...row, dateText: row.date_text });
    }
    // Vivante (ou présumée telle) ou privée : masquée sauf demande explicite.
    const hidden = (person) => {
      if (options.includeLiving) return false;
      if (person.is_private) return true;
      if (!person.is_living) return false;
      const principal = (eventsByPerson.get(person.id) ?? []).filter((e) => e.role === 'PRINCIPAL');
      return !shouldBeDeceased(principal);
    };

    const parentages = this.all('SELECT * FROM parentages WHERE deleted_at IS NULL ORDER BY id');
    const parentsOf = new Map();
    const childrenOf = new Map();
    for (const link of parentages) {
      if (!byId.has(link.child_id) || !byId.has(link.parent_id)) continue;
      if (!parentsOf.has(link.child_id)) parentsOf.set(link.child_id, []);
      parentsOf.get(link.child_id).push(link);
      if (!childrenOf.has(link.parent_id)) childrenOf.set(link.parent_id, []);
      childrenOf.get(link.parent_id).push(link);
    }

    // Périmètre : ordre de découverte (racine, ascendants par génération, puis
    // descendants par génération), qui numérote les fiches.
    let ordered;
    if (options.rootPersonId === null) {
      ordered = persons.map((person) => ({ person, generation: 0 }));
    } else {
      const root = byId.get(options.rootPersonId);
      if (!root) throw new NotFoundError('Personne racine introuvable');
      if (hidden(root)) {
        throw new ValidationError(
          'La personne racine est vivante ou privée : activez « inclure les personnes vivantes » pour l’inclure',
          {
            code: 'ROOT_PROTECTED',
            translationKey: 'server.reports.rootProtected',
            variables: { field: 'rootPersonId' },
          },
        );
      }
      ordered = [{ person: root, generation: 0 }];
      const seen = new Set([root.id]);
      const walk = (links, nextOf, sign) => {
        let frontier = [root.id];
        for (let depth = 1; depth <= options.generations && frontier.length > 0; depth += 1) {
          const next = [];
          for (const id of frontier) {
            for (const link of links.get(id) ?? []) {
              const target = nextOf(link);
              if (seen.has(target)) continue;
              seen.add(target);
              next.push(target);
              ordered.push({ person: byId.get(target), generation: sign * depth });
            }
          }
          frontier = next;
        }
      };
      if (options.direction !== 'descendants') walk(parentsOf, (link) => link.parent_id, -1);
      if (options.direction !== 'ancestors') walk(childrenOf, (link) => link.child_id, 1);
    }

    const hiddenCount = ordered.filter(({ person }) => hidden(person)).length;
    ordered = ordered.filter(({ person }) => !hidden(person));
    const numbers = new Map(ordered.map(({ person }, index) => [person.id, index + 1]));

    const reference = (personId) => {
      const person = byId.get(personId);
      if (!person) return { name: '?', personId: null, number: null, hidden: false };
      if (hidden(person))
        return { name: labels.hiddenPerson, personId: null, number: null, hidden: true };
      return {
        name: nameOf(person),
        personId,
        number: numbers.get(personId) ?? null,
        years: this.lifespan(eventsByPerson.get(personId) ?? []),
        hidden: false,
      };
    };

    // Sources numérotées à la première citation, dans l'ordre du livre.
    const sourceNumbers = new Map();
    const sourceRows = new Map(
      this.all('SELECT * FROM sources WHERE deleted_at IS NULL').map((row) => [row.id, row]),
    );
    const citations = this.all('SELECT * FROM citations WHERE deleted_at IS NULL ORDER BY id');
    const citationsByEntity = new Map();
    for (const citation of citations) {
      if (!sourceRows.has(citation.source_id)) continue;
      const key = `${citation.entity_type}:${citation.entity_id}`;
      if (!citationsByEntity.has(key)) citationsByEntity.set(key, []);
      citationsByEntity.get(key).push(citation);
    }
    const citedBy = new Map(); // source_id -> Set(numéros de fiches)
    const cite = (citation, personNumber) => {
      if (!sourceNumbers.has(citation.source_id))
        sourceNumbers.set(citation.source_id, sourceNumbers.size + 1);
      if (!citedBy.has(citation.source_id)) citedBy.set(citation.source_id, new Set());
      citedBy.get(citation.source_id).add(personNumber);
      return sourceNumbers.get(citation.source_id);
    };

    const places = new Map(
      this.all('SELECT id, name FROM places WHERE deleted_at IS NULL').map((row) => [
        row.id,
        row.name,
      ]),
    );
    const unions = this.all(
      `SELECT u.*, up.person_id FROM unions u
       JOIN union_partners up ON up.union_id = u.id AND up.deleted_at IS NULL
       WHERE u.deleted_at IS NULL ORDER BY u.id`,
    );
    const unionPartners = new Map();
    for (const row of unions) {
      if (!unionPartners.has(row.id)) unionPartners.set(row.id, { union: row, people: [] });
      unionPartners.get(row.id).people.push(row.person_id);
    }
    const eventById = new Map();
    for (const rows of eventsByPerson.values()) for (const row of rows) eventById.set(row.id, row);
    const unionsOf = new Map();
    for (const entry of unionPartners.values()) {
      for (const id of entry.people) {
        if (!unionsOf.has(id)) unionsOf.set(id, []);
        unionsOf.get(id).push(entry);
      }
    }
    const notes = this.all(
      `SELECT * FROM notes WHERE entity_type = 'PERSON' AND deleted_at IS NULL ORDER BY id`,
    );
    const notesOf = new Map();
    for (const note of notes) {
      if (!notesOf.has(note.entity_id)) notesOf.set(note.entity_id, []);
      notesOf.get(note.entity_id).push(note);
    }

    const sheets = [];
    for (const { person, generation } of ordered) {
      const number = numbers.get(person.id);
      const own = eventsByPerson.get(person.id) ?? [];
      const events = own
        .filter((row) => row.role !== 'FATHER' && row.role !== 'MOTHER' && row.role !== 'CHILD')
        .sort(compareEvents)
        .map((row) => ({
          label: labels.event[row.type] ?? row.type,
          date: this.dateLabel(row, labels),
          place: row.place_id ? (places.get(row.place_id) ?? '') : '',
          value: row.value ?? '',
          notes: row.notes ?? '',
          role: row.role === 'WITNESS' ? labels.witness : '',
          refs: (citationsByEntity.get(`EVENT:${row.id}`) ?? []).map((c) => cite(c, number)),
        }));

      const personCitations = (citationsByEntity.get(`PERSON:${person.id}`) ?? []).map((c) =>
        cite(c, number),
      );

      const parentLinks = (parentsOf.get(person.id) ?? []).map((link) => ({
        role:
          link.parent_role === 'FATHER'
            ? labels.father
            : link.parent_role === 'MOTHER'
              ? labels.mother
              : labels.parent,
        ...reference(link.parent_id),
      }));
      const spouses = [];
      for (const entry of unionsOf.get(person.id) ?? []) {
        for (const otherId of entry.people.filter((id) => id !== person.id)) {
          const start = entry.union.start_event_id
            ? eventById.get(entry.union.start_event_id)
            : null;
          spouses.push({
            ...reference(otherId),
            kind: labels.union[entry.union.type] ?? labels.union.OTHER,
            date: start ? this.dateLabel(start, labels) : '',
          });
        }
      }
      const children = (childrenOf.get(person.id) ?? []).map((link) => reference(link.child_id));

      const civil = [];
      if (person.birth_family_name && person.birth_family_name !== person.family_name) {
        civil.push([labels.birthName, person.birth_family_name]);
      }
      if (person.married_name) civil.push([labels.marriedName, person.married_name]);
      if (person.nickname) civil.push([labels.nickname, person.nickname]);
      if (person.alias) civil.push([labels.alias, person.alias]);
      civil.push([
        labels.sex,
        person.sex === 'M' ? labels.sexM : person.sex === 'F' ? labels.sexF : labels.sexU,
      ]);

      const personNotes = [];
      if (person.notes?.trim()) personNotes.push({ title: '', body: person.notes.trim() });
      for (const note of notesOf.get(person.id) ?? []) {
        personNotes.push({ title: note.title ?? '', body: note.body });
      }

      sheets.push({
        number,
        id: person.id,
        generation,
        name: nameOf(person),
        sortName: `${person.family_name}, ${person.given_names}`,
        lifespan: this.lifespan(own),
        civil,
        events,
        personRefs: personCitations,
        parents: parentLinks,
        spouses,
        children,
        notes: personNotes,
        portrait: await this.portrait(person),
      });
    }

    const sources = [...sourceNumbers.entries()]
      .map(([sourceId, number]) => {
        const row = sourceRows.get(sourceId);
        return {
          number,
          title: row.title,
          detail: [row.author, row.publication_info].filter(Boolean).join(' — '),
          citedBy: [...(citedBy.get(sourceId) ?? [])].sort((a, b) => a - b),
        };
      })
      .sort((a, b) => a.number - b.number);

    const rootSheet = options.rootPersonId
      ? sheets.find((s) => s.id === options.rootPersonId)
      : null;
    const scopeLabel =
      options.rootPersonId === null
        ? labels.subtitleTree
        : fill(
            options.direction === 'ancestors'
              ? labels.scopeAncestors
              : options.direction === 'descendants'
                ? labels.scopeDescendants
                : labels.scopeBoth,
            { n: options.generations },
          );
    return {
      options,
      title: options.title || labels.defaultTitle,
      subtitle: rootSheet
        ? fill(labels.subtitleRoot, { name: rootSheet.name })
        : labels.subtitleTree,
      scopeLabel,
      sheets,
      sources,
      hiddenCount,
    };
  }

  lifespan(rows) {
    const principal = rows.filter((row) => row.role === 'PRINCIPAL' || row.role === undefined);
    const birth =
      principal.find((row) => row.type === 'BIRTH') ??
      principal.find((row) => row.type === 'BAPTISM');
    const death =
      principal.find((row) => row.type === 'DEATH') ??
      principal.find((row) => row.type === 'BURIAL');
    const year = (row) => (row ? (yearOf(row.date_text ?? '') ?? '') : '');
    const from = year(birth);
    const to = year(death);
    if (!from && !to) return '';
    return `${from || '?'} – ${to || ''}`.trim();
  }

  dateLabel(row, labels) {
    const text = (row.date_text ?? '').trim();
    if (!text) return '';
    const prefix = {
      ABOUT: labels.about,
      ESTIMATED: labels.about,
      CALCULATED: labels.about,
      BEFORE: labels.before,
      AFTER: labels.after,
      BETWEEN: labels.between,
    }[row.date_precision];
    return prefix ? `${prefix} ${text}` : text;
  }

  /** Portrait principal : JPEG uniquement (les autres formats sont ignorés). */
  async portrait(person) {
    if (!person.portrait_media_id || !this.readMedia) return null;
    const media = this.database
      .prepare('SELECT * FROM media WHERE id = ? AND deleted_at IS NULL')
      .get(person.portrait_media_id);
    if (!media || !/^image\/jpe?g$/i.test(media.mime_type) || media.size_bytes > MAX_PHOTO_BYTES) {
      return null;
    }
    try {
      const jpeg = await this.readMedia(media.stored_filename);
      return readJpegInfo(jpeg) ? jpeg : null;
    } catch {
      return null;
    }
  }
}

function compareEvents(a, b) {
  const ya = yearOf(a.date_text ?? '') ?? Number.MAX_SAFE_INTEGER;
  const yb = yearOf(b.date_text ?? '') ?? Number.MAX_SAFE_INTEGER;
  return ya - yb || a.id - b.id;
}
