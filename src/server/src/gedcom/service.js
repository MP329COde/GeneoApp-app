import { recordAudit, withTransaction } from '../../../db/src/repositories/base-repository.js';
import { parseGedcom, validateGedcom } from './parser.js';

const EVENT_TAGS = {
  BIRT: 'BIRTH',
  DEAT: 'DEATH',
  BAPM: 'BAPTISM',
  BURI: 'BURIAL',
  ADOP: 'ADOPTION',
};

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
