import { recordAudit, withTransaction } from '../../../db/src/repositories/base-repository.js';
import { parseGedcom, validateGedcom } from './parser.js';
import { PayloadTooLargeError, ValidationError } from '../errors.js';
import { createZip, readZip } from './zip.js';

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

// Types métier sans tag GEDCOM dédié : représentés via le tag générique EVEN
// avec une sous-structure TYPE, comme le prévoit la norme 5.5.1 pour tout
// événement hors catalogue standard (§ EVENT_DETAIL / event_descriptor).
const GENERIC_EVENT_LABELS = { MILITARY: 'Military' };
const GENERIC_EVENT_TYPES = Object.fromEntries(
  Object.entries(GENERIC_EVENT_LABELS).map(([type, label]) => [label.toLowerCase(), type]),
);

function resolveEventType(record) {
  if (EVENT_TAGS[record.tag]) return EVENT_TAGS[record.tag];
  if (record.tag === 'EVEN') {
    const typeValue = value(record, 'TYPE');
    return typeValue ? (GENERIC_EVENT_TYPES[typeValue.trim().toLowerCase()] ?? null) : null;
  }
  return null;
}

const MAX_ARCHIVE_BASE64 = Math.ceil((200 * 1024 * 1024 * 4) / 3);
const FORM_551 = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/tiff': 'tif',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
};

function mediaPath(media) {
  const safe = media.original_filename
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 80);
  return `media/${media.id}-${safe || 'fichier'}`;
}

export class GedcomService {
  constructor(database, { media = null } = {}) {
    this.database = database;
    this.media = media;
  }

  /**
   * GEDZIP (GEDCOM 7) : archive contenant gedcom.ged et les fichiers médias
   * référencés par les enregistrements OBJE des personnes exportées.
   */
  async exportArchive(options = {}) {
    const result = this.export({ ...options, format: '7' });
    const entries = [{ name: 'gedcom.ged', content: Buffer.from(result.gedcom, 'utf8') }];
    for (const item of result.media) {
      const { content } = await this.media.download(item.id);
      entries.push({ name: item.path, content });
    }
    return {
      filename: 'geneoapp-export.gdz',
      contentBase64: createZip(entries).toString('base64'),
      summary: result.summary,
    };
  }

  async importArchive(contentBase64, { performedBy = null } = {}) {
    if (typeof contentBase64 !== 'string' || contentBase64 === '') {
      throw new ValidationError('Archive GEDZIP manquante', {
        fields: { contentBase64: 'obligatoire' },
      });
    }
    if (contentBase64.length > MAX_ARCHIVE_BASE64) {
      throw new PayloadTooLargeError('Archive GEDZIP trop volumineuse');
    }
    const entries = readZip(Buffer.from(contentBase64, 'base64'));
    const gedcomEntry =
      entries.find((entry) => entry.name === 'gedcom.ged') ??
      entries.find((entry) => entry.name.toLowerCase().endsWith('.ged'));
    if (!gedcomEntry) throw new ValidationError('Aucun fichier .ged dans l’archive');
    const text = gedcomEntry.content.toString('utf8');
    const report = this.import(text, { performedBy });
    if (!report.imported) return { ...report, media: { attached: 0, missing: [], rejected: [] } };

    const files = new Map(entries.map((entry) => [entry.name, entry.content]));
    const links = collectMediaLinks(parseGedcom(text));
    const media = { attached: 0, missing: [], rejected: [] };
    for (const link of links) {
      const personId = report.personXrefs?.[link.personXref];
      const content = files.get(link.file);
      if (!personId) continue;
      if (!content) {
        media.missing.push(link.file);
        continue;
      }
      try {
        await this.media.upload(
          {
            filename: link.file.split('/').pop(),
            contentBase64: content.toString('base64'),
            entityType: 'PERSON',
            entityId: personId,
            notes: link.title ?? null,
          },
          { performedBy },
        );
        media.attached += 1;
      } catch (error) {
        media.rejected.push({ file: link.file, reason: error.message });
      }
    }
    return { ...report, media };
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
    return { ...report, imported: true, ids: result.ids, personXrefs: result.personXrefs };
  }

  /**
   * Export par périmètre : arbre complet (défaut), sélection (`personIds`),
   * personne seule (`personOnly`), ancêtres / descendants d'une personne, ou
   * branche paternelle / maternelle (`branchOf` + `side`). Les périmètres se
   * cumulent ; sans aucun, tout l'arbre est exporté.
   */
  export({
    format = '7',
    personIds = null,
    personOnly = null,
    ancestorsOf = null,
    descendantsOf = null,
    branchOf = null,
    side = null,
  } = {}) {
    if (!['5.5.1', '7'].includes(format)) {
      throw new ValidationError(`Format GEDCOM non supporté pour l’export : ${format}`, {
        format: 'invalide',
      });
    }
    const asId = (value, field) => {
      if (value === null || value === undefined) return null;
      const id = Number(value);
      if (!Number.isInteger(id) || id <= 0) {
        throw new ValidationError(`${field} invalide`, { fields: { [field]: 'invalide' } });
      }
      return id;
    };
    const onlyId = asId(personOnly, 'personOnly');
    const ancestorsId = asId(ancestorsOf, 'ancestorsOf');
    const descendantsId = asId(descendantsOf, 'descendantsOf');
    const branchId = asId(branchOf, 'branchOf');
    if (branchId !== null && !['PATERNAL', 'MATERNAL'].includes(side)) {
      throw new ValidationError('side doit valoir PATERNAL ou MATERNAL', {
        fields: { side: 'invalide' },
      });
    }
    if (personIds !== null && !Array.isArray(personIds)) {
      throw new ValidationError('personIds doit être une liste', {
        fields: { personIds: 'invalide' },
      });
    }

    const allPersons = this.database
      .prepare('SELECT * FROM persons WHERE deleted_at IS NULL ORDER BY id')
      .all();
    const scoped =
      (personIds?.length ?? 0) > 0 ||
      [onlyId, ancestorsId, descendantsId, branchId].some((id) => id !== null);
    const selectedIds = new Set(
      scoped ? (personIds ?? []).map((id) => asId(id, 'personIds')) : allPersons.map((p) => p.id),
    );
    if (onlyId !== null) selectedIds.add(onlyId);
    if (ancestorsId !== null) {
      selectedIds.add(ancestorsId);
      this.collectParents(ancestorsId, selectedIds);
    }
    if (descendantsId !== null) {
      selectedIds.add(descendantsId);
      this.collectChildren(descendantsId, selectedIds);
    }
    if (branchId !== null) {
      const role = side === 'PATERNAL' ? 'FATHER' : 'MOTHER';
      const parent = this.database
        .prepare(
          `SELECT parent_id FROM parentages
           WHERE child_id = ? AND parent_role = ? AND deleted_at IS NULL`,
        )
        .get(branchId, role);
      if (parent) {
        selectedIds.add(parent.parent_id);
        this.collectParents(parent.parent_id, selectedIds);
      }
    }
    const persons = allPersons.filter((person) => selectedIds.has(person.id));
    const families = buildExportFamilies(this.database, selectedIds);
    const media = this.database
      .prepare(
        `SELECT * FROM media WHERE entity_type = 'PERSON' AND deleted_at IS NULL ORDER BY id`,
      )
      .all()
      .filter((item) => selectedIds.has(item.entity_id))
      .map((item) => ({ ...item, path: mediaPath(item) }));
    return {
      format,
      gedcom: generateGedcom(this.database, persons, families, format, media),
      summary: { persons: persons.length, families: families.length, media: media.length },
      media: media.map((item) => ({ id: item.id, path: item.path, mimeType: item.mime_type })),
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

const PEDIGREE_TAGS = { BIOLOGICAL: 'BIRTH', ADOPTIVE: 'ADOPTED', FOSTER: 'FOSTER', STEP: 'OTHER' };
const PEDIGREE_TO_LINK = {
  BIRTH: 'BIOLOGICAL',
  ADOPTED: 'ADOPTIVE',
  FOSTER: 'FOSTER',
  OTHER: 'STEP',
};

/**
 * Familles à exporter : chaque union, plus une famille par ensemble de
 * parents pour les filiations saisies sans union (sinon elles seraient
 * perdues). Chaque enfant n'apparaît qu'une fois par famille.
 */
function buildExportFamilies(database, selectedIds) {
  const parentages = database
    .prepare(
      `SELECT child_id, parent_id, link_type, union_id FROM parentages
       WHERE deleted_at IS NULL ORDER BY id`,
    )
    .all();
  const families = [];
  for (const union of database
    .prepare('SELECT * FROM unions WHERE deleted_at IS NULL ORDER BY id')
    .all()) {
    const partners = database
      .prepare('SELECT person_id FROM union_partners WHERE union_id = ? AND deleted_at IS NULL')
      .all(union.id)
      .map(({ person_id: personId }) => personId);
    const children = new Map();
    for (const link of parentages.filter((item) => item.union_id === union.id)) {
      if (!children.has(link.child_id)) {
        children.set(link.child_id, { id: link.child_id, linkType: link.link_type });
      }
    }
    families.push({ xref: `@F${union.id}@`, partners, children: [...children.values()] });
  }
  const byChild = new Map();
  for (const link of parentages.filter((item) => item.union_id === null)) {
    if (!byChild.has(link.child_id)) byChild.set(link.child_id, []);
    byChild.get(link.child_id).push(link);
  }
  const synthetic = new Map();
  for (const [childId, links] of byChild) {
    const parents = [...new Set(links.map((link) => link.parent_id))].sort((a, b) => a - b);
    const key = parents.join('-');
    if (!synthetic.has(key)) {
      synthetic.set(key, { xref: `@FP${key}@`, partners: parents, children: [], noUnion: true });
    }
    synthetic.get(key).children.push({ id: childId, linkType: links[0].link_type });
  }
  families.push(...synthetic.values());
  return families.filter(
    (family) =>
      family.partners.some((id) => selectedIds.has(id)) ||
      family.children.some((item) => selectedIds.has(item.id)),
  );
}

function generateGedcom(database, persons, families, format, media = []) {
  const personIds = new Set(persons.map((person) => person.id));
  const lines = ['0 HEAD', `1 GEDC`, `2 VERS ${format}`, '1 CHAR UTF-8'];
  for (const person of persons) {
    const xref = `@I${person.id}@`;
    lines.push(`0 ${xref} INDI`);
    lines.push(`1 NAME ${person.given_names} /${person.family_name}/`);
    lines.push(`1 SEX ${person.sex}`);
    if (person.nickname) lines.push(`1 NICK ${person.nickname}`);
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
      const genericLabel = GENERIC_EVENT_LABELS[event.type];
      if (!tag && !genericLabel) continue;
      lines.push(`1 ${tag ?? 'EVEN'}`);
      if (genericLabel) lines.push(`2 TYPE ${genericLabel}`);
      if (event.date_text) lines.push(`2 DATE ${event.date_text}`);
      if (event.place_id) {
        const place = database.prepare('SELECT name FROM places WHERE id = ?').get(event.place_id);
        if (place) lines.push(`2 PLAC ${place.name}`);
      }
    }
    for (const item of media.filter((candidate) => candidate.entity_id === person.id)) {
      lines.push(`1 OBJE @O${item.id}@`);
    }
    for (const family of families) {
      if (family.partners.includes(person.id)) lines.push(`1 FAMS ${family.xref}`);
      const link = family.children.find((item) => item.id === person.id);
      if (link) {
        lines.push(`1 FAMC ${family.xref}`);
        const pedigree = PEDIGREE_TAGS[link.linkType];
        if (pedigree) lines.push(`2 PEDI ${format === '7' ? pedigree : pedigree.toLowerCase()}`);
      }
    }
  }
  const sexById = new Map(persons.map((person) => [person.id, person.sex]));
  for (const family of families) {
    lines.push(`0 ${family.xref} FAM`);
    // HUSB/WIFE d'après le sexe quand il est connu, sinon dans l'ordre.
    const partners = family.partners
      .filter((id) => personIds.has(id))
      .sort((a, b) => (sexById.get(a) === 'F') - (sexById.get(b) === 'F'));
    partners.slice(0, 2).forEach((partnerId, index) => {
      lines.push(`1 ${index === 0 ? 'HUSB' : 'WIFE'} @I${partnerId}@`);
    });
    for (const item of family.children.filter((candidate) => personIds.has(candidate.id))) {
      lines.push(`1 CHIL @I${item.id}@`);
    }
    // Filiation sans union dans GeneoApp : ne pas inventer d'union à l'import.
    if (family.noUnion) lines.push('1 _NOUNION Y');
  }
  for (const item of media) {
    lines.push(`0 @O${item.id}@ OBJE`);
    lines.push(`1 FILE ${item.path}`);
    lines.push(`2 FORM ${format === '7' ? item.mime_type : (FORM_551[item.mime_type] ?? 'bin')}`);
    lines.push(`${format === '7' ? '3' : '2'} TITL ${item.original_filename}`.replace(/\n/g, ' '));
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
        (count, person) =>
          count + person.children.filter((child) => resolveEventType(child)).length,
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
    `INSERT INTO persons (given_names, family_name, birth_family_name, sex, notes, nickname, external_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
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
  // Une même filiation ne peut être insérée deux fois (index unique).
  const insertedPairs = new Set();

  for (const person of records.filter((record) => record.tag === 'INDI')) {
    const name = parseName(value(person, 'NAME'));
    const result = insertPerson.run(
      name.givenNames,
      name.familyName,
      null,
      sex(value(person, 'SEX')),
      notes(person),
      value(person, 'NICK') ?? null,
      person.xref ?? null,
    );
    personIds.set(person.xref, result.lastInsertRowid);
    ids.persons.push(result.lastInsertRowid);
    audit(database, 'persons', result.lastInsertRowid, { xref: person.xref }, performedBy);
  }

  for (const person of records.filter((record) => record.tag === 'INDI')) {
    for (const event of person.children.filter((child) => resolveEventType(child))) {
      const eventId = insertEventRecord(
        database,
        insertEvent,
        insertPlace,
        placeIds,
        resolveEventType(event),
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
    // _NOUNION (extension GeneoApp) : filiation sans union à recréer telle quelle.
    const withoutUnion = value(family, '_NOUNION') === 'Y';
    const union = withoutUnion
      ? null
      : insertUnion.run('OTHER', startEventId, endEventId, notes(family));
    if (union) {
      ids.unions.push(union.lastInsertRowid);
      audit(database, 'unions', union.lastInsertRowid, { xref: family.xref }, performedBy);
    }

    for (const spouseTag of union ? ['HUSB', 'WIFE'] : []) {
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
    const childXrefs = [...new Set(children(family, 'CHIL').map((item) => item.value))];
    for (const childXref of childXrefs) {
      const childRef = { value: childXref };
      const linkType = pedigreeOf(records, childXref, family.xref);
      for (const parentTag of ['HUSB', 'WIFE']) {
        const parentRef = child(family, parentTag);
        if (!parentRef) continue;
        const pairKey = `${childXref}>${parentRef.value}`;
        if (insertedPairs.has(pairKey)) continue;
        insertedPairs.add(pairKey);
        const parentRecord = records.find((record) => record.xref === parentRef.value);
        const parentSex = parentRecord ? value(parentRecord, 'SEX') : null;
        const role = parentSex === 'F' ? 'MOTHER' : parentSex === 'M' ? 'FATHER' : 'PARENT';
        const parentage = insertParentage.run(
          personIds.get(childRef.value),
          personIds.get(parentRef.value),
          role,
          linkType,
          union ? union.lastInsertRowid : null,
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
            unionId: union ? union.lastInsertRowid : null,
          },
          performedBy,
        );
      }
    }
  }
  return { ids, personXrefs: Object.fromEntries(personIds) };
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

// Liens personne → fichier : OBJE référencé (@O1@) ou OBJE en ligne sous INDI.
function collectMediaLinks(records) {
  const objects = new Map(
    records
      .filter((record) => record.tag === 'OBJE' && record.xref)
      .map((record) => {
        const file = child(record, 'FILE');
        return [
          record.xref,
          { file: file?.value, title: child(file ?? record, 'TITL')?.value ?? null },
        ];
      }),
  );
  const links = [];
  for (const person of records.filter((record) => record.tag === 'INDI')) {
    for (const reference of children(person, 'OBJE')) {
      const target = reference.value
        ? objects.get(reference.value)
        : { file: value(reference, 'FILE'), title: value(reference, 'TITL') ?? null };
      if (target?.file) links.push({ personXref: person.xref, ...target });
    }
  }
  return links;
}

function pedigreeOf(records, childXref, familyXref) {
  const person = records.find((record) => record.tag === 'INDI' && record.xref === childXref);
  if (!person) return 'BIOLOGICAL';
  const famc = children(person, 'FAMC').find((link) => link.value === familyXref);
  const pedigree = famc ? value(famc, 'PEDI')?.toUpperCase() : null;
  return PEDIGREE_TO_LINK[pedigree] ?? 'BIOLOGICAL';
}
