import { recordAudit, withTransaction } from '../../../db/src/repositories/base-repository.js';
import { parseGedcom, validateGedcom } from './parser.js';

// Tags GEDCOM 5.5.1 individuels (INDIVIDUAL_EVENT_STRUCTURE / INDIVIDUAL_ATTRIBUTE_STRUCTURE)
// mappés vers les types métier. Sans équivalent standard direct dans la norme (ex. événement
// militaire générique), un type reste non mappé plutôt que forcé sous un tag inexact.
const EVENT_TAGS = {
  BIRT: 'BIRTH',
  DEAT: 'DEATH',
  BAPM: 'BAPTISM',
  BURI: 'BURIAL',
  ADOP: 'ADOPTION',
  OCCU: 'OCCUPATION',
  RESI: 'RESIDENCE',
  EMIG: 'EMIGRATION',
  IMMI: 'IMMIGRATION',
  CENS: 'CENSUS',
  NATU: 'NATURALIZATION',
  WILL: 'WILL',
  PROB: 'PROBATE',
  EDUC: 'GRADUATION',
  RELI: 'RELIGIOUS_EVENT',
};
const EXPORT_EVENT_TAGS = Object.fromEntries(
  Object.entries(EVENT_TAGS).map(([tag, type]) => [type, tag]),
);

export class GedcomService {
  constructor(database) {
    this.database = database;
  }

  preview(input) {
    const records = parseGedcom(input);
    const validation = validateGedcom(records);
    return { ...validation, mapping: buildMappingPreview(records) };
  }

  import(input, { performedBy = null } = {}) {
    const records = parseGedcom(input);
    const validation = validateGedcom(records);
    const report = { ...validation, mapping: buildMappingPreview(records), imported: false };
    if (!validation.valid) return report;

    const result = withTransaction(this.database, () =>
      applyMapping(this.database, records, performedBy),
    );
    return { ...report, imported: true, ids: result.ids };
  }

  export({ format = '7', personIds = null, ancestorsOf = null, descendantsOf = null } = {}) {
    if (!['5.5.1', '7'].includes(format)) {
      throw new Error(`Format GEDCOM non supporté pour l’export : ${format}`);
    }

    const allPersons = this.database
      .prepare('SELECT * FROM persons WHERE deleted_at IS NULL ORDER BY id')
      .all();
    const selectedIds = new Set(
      Array.isArray(personIds) && personIds.length > 0
        ? personIds.map(Number)
        : allPersons.map((person) => person.id),
    );
    if (ancestorsOf !== null) {
      selectedIds.add(Number(ancestorsOf));
      this.collectParents(Number(ancestorsOf), selectedIds);
    }
    if (descendantsOf !== null) {
      selectedIds.add(Number(descendantsOf));
      this.collectChildren(Number(descendantsOf), selectedIds);
    }
    const persons = allPersons.filter((person) => selectedIds.has(person.id));
    const families = this.database
      .prepare('SELECT * FROM unions WHERE deleted_at IS NULL ORDER BY id')
      .all()
      .map((union) => ({
        ...union,
        partners: this.database
          .prepare('SELECT person_id FROM union_partners WHERE union_id = ? AND deleted_at IS NULL')
          .all(union.id)
          .map(({ person_id: personId }) => personId),
        children: this.database
          .prepare('SELECT child_id FROM parentages WHERE union_id = ? AND deleted_at IS NULL')
          .all(union.id)
          .map(({ child_id: childId }) => childId),
      }))
      .filter(
        (union) =>
          union.partners.some((personId) => selectedIds.has(personId)) ||
          union.children.some((personId) => selectedIds.has(personId)),
      );

    return {
      format,
      gedcom: generateGedcom(this.database, persons, families, format),
      summary: { persons: persons.length, families: families.length },
    };
  }

  collectParents(personId, selectedIds) {
    const parents = this.database
      .prepare('SELECT parent_id FROM parentages WHERE child_id = ? AND deleted_at IS NULL')
      .all(personId);
    for (const { parent_id: parentId } of parents) {
      if (selectedIds.has(parentId)) continue;
      selectedIds.add(parentId);
      this.collectParents(parentId, selectedIds);
    }
  }

  collectChildren(personId, selectedIds) {
    const children = this.database
      .prepare('SELECT child_id FROM parentages WHERE parent_id = ? AND deleted_at IS NULL')
      .all(personId);
    for (const { child_id: childId } of children) {
      if (selectedIds.has(childId)) continue;
      selectedIds.add(childId);
      this.collectChildren(childId, selectedIds);
    }
  }
}

function generateGedcom(database, persons, families, format) {
  const personIds = new Set(persons.map((person) => person.id));
  const lines = ['0 HEAD', `1 GEDC`, `2 VERS ${format}`, '1 CHAR UTF-8'];
  for (const person of persons) {
    const xref = `@I${person.id}@`;
    lines.push(`0 ${xref} INDI`);
    lines.push(`1 NAME ${person.given_names} /${person.family_name}/`);
    lines.push(`1 SEX ${person.sex}`);
    const events = database
      .prepare(
        `SELECT e.* FROM events e
         JOIN event_participants ep ON ep.event_id = e.id
         WHERE ep.person_id = ? AND ep.role = 'PRINCIPAL' AND e.deleted_at IS NULL
         ORDER BY e.id`,
      )
      .all(person.id);
    for (const event of events) {
      const tag = EXPORT_EVENT_TAGS[event.type];
      if (!tag) continue;
      lines.push(`1 ${tag}`);
      if (event.date_text) lines.push(`2 DATE ${event.date_text}`);
      if (event.place_id) {
        const place = database.prepare('SELECT name FROM places WHERE id = ?').get(event.place_id);
        if (place) lines.push(`2 PLAC ${place.name}`);
      }
    }
    for (const family of families) {
      if (family.partners.includes(person.id)) lines.push(`1 FAMS @F${family.id}@`);
      if (family.children.includes(person.id)) lines.push(`1 FAMC @F${family.id}@`);
    }
  }
  for (const family of families) {
    lines.push(`0 @F${family.id}@ FAM`);
    for (const partnerId of family.partners.filter((id) => personIds.has(id))) {
      const tag = family.partners.indexOf(partnerId) === 0 ? 'HUSB' : 'WIFE';
      lines.push(`1 ${tag} @I${partnerId}@`);
    }
    for (const childId of family.children.filter((id) => personIds.has(id))) {
      lines.push(`1 CHIL @I${childId}@`);
    }
  }
  lines.push('0 TRLR');
  return `${lines.join('\n')}\n`;
}

function buildMappingPreview(records) {
  const individuals = records.filter((record) => record.tag === 'INDI');
  const families = records.filter((record) => record.tag === 'FAM');
  return {
    persons: individuals.length,
    events:
      individuals.reduce(
        (count, person) => count + person.children.filter((child) => EVENT_TAGS[child.tag]).length,
        0,
      ) +
      families.reduce(
        (count, family) =>
          count +
          family.children.filter((child) => child.tag === 'MARR' || child.tag === 'DIV').length,
        0,
      ),
    unions: families.length,
    parentages: families.reduce(
      (count, family) =>
        count +
        children(family, 'CHIL').length *
          (children(family, 'HUSB').length + children(family, 'WIFE').length),
      0,
    ),
  };
}

function applyMapping(database, records, performedBy) {
  const personIds = new Map();
  const eventIds = new Map();
  const ids = { persons: [], events: [], unions: [], parentages: [] };
  const insertPerson = database.prepare(
    `INSERT INTO persons (given_names, family_name, birth_family_name, sex, notes) VALUES (?, ?, ?, ?, ?)`,
  );
  const insertPlace = database.prepare(`INSERT INTO places (name, normalized_name) VALUES (?, ?)`);
  const insertEvent = database.prepare(
    `INSERT INTO events (type, date_text, date_precision, place_id, notes) VALUES (?, ?, ?, ?, ?)`,
  );
  const insertParticipant = database.prepare(
    `INSERT INTO event_participants (event_id, person_id, role) VALUES (?, ?, ?)`,
  );
  const insertUnion = database.prepare(
    `INSERT INTO unions (type, start_event_id, end_event_id, notes) VALUES (?, ?, ?, ?)`,
  );
  const insertPartner = database.prepare(
    `INSERT INTO union_partners (union_id, person_id) VALUES (?, ?)`,
  );
  const insertParentage = database.prepare(
    `INSERT INTO parentages (child_id, parent_id, parent_role, link_type, union_id, notes) VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const placeIds = new Map();

  for (const person of records.filter((record) => record.tag === 'INDI')) {
    const name = parseName(value(person, 'NAME'));
    const result = insertPerson.run(
      name.givenNames,
      name.familyName,
      null,
      sex(value(person, 'SEX')),
      notes(person),
    );
    personIds.set(person.xref, result.lastInsertRowid);
    ids.persons.push(result.lastInsertRowid);
    audit(database, 'persons', result.lastInsertRowid, { xref: person.xref }, performedBy);
  }

  for (const person of records.filter((record) => record.tag === 'INDI')) {
    for (const event of person.children.filter((child) => EVENT_TAGS[child.tag])) {
      const eventId = insertEventRecord(
        database,
        insertEvent,
        insertPlace,
        placeIds,
        EVENT_TAGS[event.tag],
        event,
        performedBy,
      );
      eventIds.set(`${person.xref}:${event.tag}`, eventId);
      ids.events.push(eventId);
      const participant = insertParticipant.run(eventId, personIds.get(person.xref), 'PRINCIPAL');
      audit(
        database,
        'event_participants',
        participant.lastInsertRowid,
        { eventId, personId: personIds.get(person.xref), role: 'PRINCIPAL' },
        performedBy,
      );
    }
  }

  for (const family of records.filter((record) => record.tag === 'FAM')) {
    const marriage = child(family, 'MARR');
    const divorce = child(family, 'DIV');
    const startEventId = marriage
      ? insertEventRecord(
          database,
          insertEvent,
          insertPlace,
          placeIds,
          'MARRIAGE',
          marriage,
          performedBy,
        )
      : null;
    const endEventId = divorce
      ? insertEventRecord(
          database,
          insertEvent,
          insertPlace,
          placeIds,
          'DIVORCE',
          divorce,
          performedBy,
        )
      : null;
    const union = insertUnion.run('OTHER', startEventId, endEventId, notes(family));
    ids.unions.push(union.lastInsertRowid);
    audit(database, 'unions', union.lastInsertRowid, { xref: family.xref }, performedBy);

    for (const spouseTag of ['HUSB', 'WIFE']) {
      for (const spouse of children(family, spouseTag)) {
        const partner = insertPartner.run(union.lastInsertRowid, personIds.get(spouse.value));
        audit(
          database,
          'union_partners',
          partner.lastInsertRowid,
          { unionId: union.lastInsertRowid, personId: personIds.get(spouse.value) },
          performedBy,
        );
      }
    }
    for (const childRef of children(family, 'CHIL')) {
      for (const parentTag of ['HUSB', 'WIFE']) {
        const parentRef = child(family, parentTag);
        if (!parentRef) continue;
        const parentage = insertParentage.run(
          personIds.get(childRef.value),
          personIds.get(parentRef.value),
          parentTag === 'HUSB' ? 'FATHER' : 'MOTHER',
          'BIOLOGICAL',
          union.lastInsertRowid,
          null,
        );
        ids.parentages.push(parentage.lastInsertRowid);
        audit(
          database,
          'parentages',
          parentage.lastInsertRowid,
          {
            childId: personIds.get(childRef.value),
            parentId: personIds.get(parentRef.value),
            unionId: union.lastInsertRowid,
          },
          performedBy,
        );
      }
    }
  }
  return { ids };
}

function insertEventRecord(
  database,
  insertEvent,
  insertPlace,
  placeIds,
  type,
  record,
  performedBy,
) {
  const placeName = value(record, 'PLAC');
  let placeId = null;
  if (placeName) {
    const normalized = placeName.trim().toLocaleLowerCase();
    placeId = placeIds.get(normalized);
    if (!placeId) {
      const existing = database
        .prepare('SELECT id FROM places WHERE normalized_name = ? AND deleted_at IS NULL')
        .get(normalized);
      placeId = existing?.id;
      if (!placeId) placeId = insertPlace.run(placeName.trim(), normalized).lastInsertRowid;
      placeIds.set(normalized, placeId);
    }
  }
  const result = insertEvent.run(
    type,
    value(record, 'DATE'),
    datePrecision(value(record, 'DATE')),
    placeId,
    notes(record),
  );
  audit(database, 'events', result.lastInsertRowid, { type }, performedBy);
  return result.lastInsertRowid;
}

function audit(database, tableName, rowId, changes, performedBy) {
  recordAudit(database, { tableName, rowId, operation: 'INSERT', changes, performedBy });
}

function parseName(raw = '') {
  const match = /^(.*?)\s*\/([^/]*)\//.exec(raw.trim());
  if (!match) return { givenNames: raw.trim() || 'Inconnu', familyName: 'Inconnu' };
  return { givenNames: match[1].trim() || 'Inconnu', familyName: match[2].trim() || 'Inconnu' };
}

function sex(value) {
  return ['M', 'F'].includes(value) ? value : 'U';
}

function datePrecision(value) {
  if (!value) return 'UNKNOWN';
  if (/^ABT\b/i.test(value)) return 'ABOUT';
  if (/^BEF\b/i.test(value)) return 'BEFORE';
  if (/^AFT\b/i.test(value)) return 'AFTER';
  if (/^BET\b/i.test(value)) return 'BETWEEN';
  return 'EXACT';
}

function notes(record) {
  return (
    children(record, 'NOTE')
      .map((note) => note.value)
      .join('\n') || null
  );
}

function value(record, tag) {
  return child(record, tag)?.value ?? null;
}

function children(record, tag) {
  return record?.children.filter((item) => item.tag === tag) ?? [];
}

function child(record, tag) {
  return children(record, tag)[0] ?? null;
}
