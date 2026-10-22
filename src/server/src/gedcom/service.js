import { recordAudit, withTransaction } from '../../../db/src/repositories/base-repository.js';
import { reindexAll } from '../../../db/src/repositories/search-reindex.js';
import { shouldBeDeceased } from '../../../db/src/genealogy/living-status.js';
import { parseGedcom, validateGedcom } from './parser.js';
import { PayloadTooLargeError, fieldError } from '../errors.js';
import { invalidError, requiredError } from '../validation/field-errors.js';
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
const GENERIC_EVENT_LABELS = {
  MILITARY: 'Military',
  MIGRATION: 'Migration',
  SUCCESSION: 'Succession',
  RELIGIOUS_COMMITMENT: 'Religious commitment',
};
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
  constructor(database, { media = null, backups = null } = {}) {
    this.database = database;
    this.media = media;
    this.backups = backups;
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
      throw requiredError('contentBase64', 'Archive GEDZIP manquante');
    }
    if (contentBase64.length > MAX_ARCHIVE_BASE64) {
      throw new PayloadTooLargeError('Archive GEDZIP trop volumineuse');
    }
    const entries = readZip(Buffer.from(contentBase64, 'base64'));
    const gedcomEntry =
      entries.find((entry) => entry.name === 'gedcom.ged') ??
      entries.find((entry) => entry.name.toLowerCase().endsWith('.ged'));
    if (!gedcomEntry) {
      throw fieldError(
        'contentBase64',
        'NO_GEDCOM_FILE',
        'server.validation.noGedcomFile',
        'Aucun fichier .ged dans l’archive',
        { field: 'contentBase64' },
      );
    }
    const text = gedcomEntry.content.toString('utf8');
    const report = await this.importSafely(text, { performedBy });
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
    return {
      ...validation,
      mapping: buildMappingPreview(records),
      contents: buildContentsPreview(records),
      unmapped: buildUnmappedPreview(records),
    };
  }

  /**
   * Import sans casser la base : sauvegarde automatique si le fichier est
   * valide, puis import transactionnel (tout ou rien).
   */
  async importSafely(input, { performedBy = null } = {}) {
    if (this.backups && this.preview(input).valid) {
      await this.backups.createAutomatic('avant-import-gedcom');
    }
    return this.import(input, { performedBy });
  }

  import(input, { performedBy = null } = {}) {
    const records = parseGedcom(input);
    const validation = validateGedcom(records);
    const report = {
      ...validation,
      mapping: buildMappingPreview(records),
      contents: buildContentsPreview(records),
      unmapped: buildUnmappedPreview(records),
      imported: false,
    };
    if (!validation.valid) return report;

    const result = withTransaction(this.database, () => {
      const applied = applyMapping(this.database, records, performedBy);
      // L'import écrit en SQL direct, sans passer par les dépôts métier :
      // l'index de recherche locale n'était donc pas alimenté, et les
      // personnes importées restaient introuvables. On réindexe après
      // l'import, dans la même transaction (une importation échouée ne
      // laisse pas d'index à moitié construit).
      reindexAll(this.database);
      return applied;
    });
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
      throw invalidError('format', `Format GEDCOM non supporté pour l’export : ${format}`, {
        format,
        allowed: '5.5.1, 7',
      });
    }
    const asId = (value, field) => {
      if (value === null || value === undefined) return null;
      const id = Number(value);
      if (!Number.isInteger(id) || id <= 0) {
        throw invalidError(field);
      }
      return id;
    };
    const onlyId = asId(personOnly, 'personOnly');
    const ancestorsId = asId(ancestorsOf, 'ancestorsOf');
    const descendantsId = asId(descendantsOf, 'descendantsOf');
    const branchId = asId(branchOf, 'branchOf');
    if (branchId !== null && !['PATERNAL', 'MATERNAL'].includes(side)) {
      throw invalidError('side', 'side doit valoir PATERNAL ou MATERNAL', {
        allowed: 'PATERNAL, MATERNAL',
      });
    }
    if (personIds !== null && !Array.isArray(personIds)) {
      throw invalidError('personIds', 'personIds doit être une liste');
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
    const gedcom = generateGedcom(this.database, persons, families, format, media);
    verifyExport(gedcom, { persons: persons.length, families: families.length });
    return {
      format,
      gedcom,
      summary: {
        persons: persons.length,
        families: families.length,
        media: media.length,
        verified: true,
      },
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

const PEDIGREE_TAGS = {
  BIOLOGICAL: 'BIRTH',
  ADOPTIVE: 'ADOPTED',
  FOSTER: 'FOSTER',
  STEP: 'OTHER',
  GUARDIAN: 'OTHER',
};
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
    families.push({
      xref: `@F${union.id}@`,
      unionId: union.id,
      union,
      partners,
      children: [...children.values()],
    });
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
  const lines =
    format === '7'
      ? ['0 HEAD', '1 GEDC', '2 VERS 7.0', '1 SOUR GeneoApp', '2 NAME GeneoApp']
      : [
          '0 HEAD',
          '1 SOUR GeneoApp',
          '2 NAME GeneoApp',
          '1 GEDC',
          '2 VERS 5.5.1',
          '2 FORM LINEAGE-LINKED',
          '1 CHAR UTF-8',
          '1 SUBM @SUBM1@',
          '0 @SUBM1@ SUBM',
          '1 NAME GeneoApp',
        ];
  const usedSources = new Set();
  const citationsFor = database.prepare(
    `SELECT c.* FROM citations c
     JOIN sources s ON s.id = c.source_id AND s.deleted_at IS NULL
     WHERE c.entity_type = ? AND c.entity_id = ? AND c.deleted_at IS NULL ORDER BY c.id`,
  );
  const quayOf = { LOW: 1, MEDIUM: 2, HIGH: 3 };
  const emitNote = (level, text) => {
    if (text) lines.push(`${level} NOTE ${text}`);
  };
  const emitCitations = (level, entityType, entityId) => {
    for (const citation of citationsFor.all(entityType, entityId)) {
      usedSources.add(citation.source_id);
      lines.push(`${level} SOUR @S${citation.source_id}@`);
      if (citation.page) lines.push(`${level + 1} PAGE ${citation.page}`);
      lines.push(`${level + 1} QUAY ${quayOf[citation.confidence] ?? 2}`);
      if (citation.quotation) {
        lines.push(`${level + 1} DATA`, `${level + 2} TEXT ${citation.quotation}`);
      }
      emitNote(level + 1, citation.notes);
    }
  };
  const emitPlace = (level, placeId) => {
    if (!placeId) return;
    const place = database.prepare('SELECT * FROM places WHERE id = ?').get(placeId);
    if (!place) return;
    lines.push(`${level} PLAC ${place.name}`);
    if (place.latitude !== null && place.longitude !== null) {
      const latitude = `${place.latitude < 0 ? 'S' : 'N'}${Math.abs(place.latitude)}`;
      const longitude = `${place.longitude < 0 ? 'W' : 'E'}${Math.abs(place.longitude)}`;
      lines.push(
        `${level + 1} MAP`,
        `${level + 2} LATI ${latitude}`,
        `${level + 2} LONG ${longitude}`,
      );
    }
  };
  const extensionsFor = database.prepare(
    `SELECT payload FROM gedcom_extensions
     WHERE entity_type = ? AND entity_id = ? AND deleted_at IS NULL ORDER BY position, id`,
  );
  const emitNode = (level, node) => {
    lines.push(`${level} ${node.tag}${node.value ? ` ${node.value}` : ''}`);
    node.children.forEach((childNode) => emitNode(level + 1, childNode));
  };
  const emitExtensions = (level, entityType, entityId) => {
    for (const row of extensionsFor.all(entityType, entityId)) {
      emitNode(level, JSON.parse(row.payload));
    }
  };
  const emitEventBody = (level, event) => {
    if (event.date_text) lines.push(`${level} DATE ${event.date_text}`);
    emitPlace(level, event.place_id);
    emitNote(level, event.notes);
    emitCitations(level, 'EVENT', event.id);
    emitExtensions(level, 'EVENT', event.id);
  };
  for (const person of persons) {
    const xref = `@I${person.id}@`;
    lines.push(`0 ${xref} INDI`);
    lines.push(`1 NAME ${person.given_names} /${person.family_name}/`);
    // Titre et suffixe sont des parties du nom principal (NPFX / NSFX).
    if (person.title) lines.push(`2 NPFX ${person.title}`);
    if (person.suffix) lines.push(`2 NSFX ${person.suffix}`);
    // Autres noms : GEDCOM 5.5.1 écrit le type en minuscules, GEDCOM 7 en majuscules.
    const nameType = (type) => `2 TYPE ${format === '7' ? type : type.toLowerCase()}`;
    if (person.birth_family_name && person.birth_family_name !== person.family_name) {
      lines.push(`1 NAME ${person.given_names} /${person.birth_family_name}/`, nameType('BIRTH'));
    }
    if (person.married_name) {
      lines.push(`1 NAME ${person.given_names} /${person.married_name}/`, nameType('MARRIED'));
    }
    if (person.alias) lines.push(`1 NAME ${person.alias}`, nameType('AKA'));
    lines.push(`1 SEX ${person.sex}`);
    if (person.nickname) lines.push(`1 NICK ${person.nickname}`);
    if (person.is_private) lines.push(`1 RESN ${format === '7' ? 'PRIVACY' : 'privacy'}`);
    for (const identifier of database
      .prepare(
        `SELECT scheme, value FROM person_identifiers
         WHERE person_id = ? AND deleted_at IS NULL ORDER BY scheme, value`,
      )
      .all(person.id)) {
      lines.push(`1 REFN ${identifier.value}`, `2 TYPE ${identifier.scheme}`);
    }
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
      lines.push(`1 ${tag ?? 'EVEN'}${event.value ? ` ${event.value}` : ''}`);
      if (genericLabel) lines.push(`2 TYPE ${genericLabel}`);
      emitEventBody(2, event);
    }
    emitNote(1, person.notes);
    emitCitations(1, 'PERSON', person.id);
    emitExtensions(1, 'PERSON', person.id);
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
        // La tutelle n'a pas de valeur PEDI propre : balise utilisateur, pour
        // la distinguer d'une filiation par alliance (PEDI other) au réimport.
        if (link.linkType === 'GUARDIAN') lines.push('2 _GUARDIAN Y');
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
    if (family.union) {
      const { union } = family;
      const fetchEvent = (id) =>
        id
          ? database.prepare('SELECT * FROM events WHERE id = ? AND deleted_at IS NULL').get(id)
          : null;
      const start = fetchEvent(union.start_event_id);
      const end = fetchEvent(union.end_event_id);
      const unionKind = { CIVIL_PARTNERSHIP: 'civil partnership', COHABITATION: 'cohabitation' }[
        union.type
      ];
      if (start || union.type === 'MARRIAGE' || unionKind) {
        lines.push('1 MARR');
        if (unionKind) lines.push(`2 TYPE ${unionKind}`);
        if (start) emitEventBody(2, start);
      }
      if (end) {
        lines.push('1 DIV');
        emitEventBody(2, end);
      }
      emitNote(1, union.notes);
      emitCitations(1, 'UNION', union.id);
      emitExtensions(1, 'UNION', union.id);
    }
  }
  for (const sourceId of [...usedSources].sort((a, b) => a - b)) {
    const source = database.prepare('SELECT * FROM sources WHERE id = ?').get(sourceId);
    lines.push(`0 @S${sourceId}@ SOUR`, `1 TITL ${source.title}`);
    if (source.author) lines.push(`1 AUTH ${source.author}`);
    if (source.publication_info) lines.push(`1 PUBL ${source.publication_info}`);
  }
  for (const item of media) {
    lines.push(`0 @O${item.id}@ OBJE`);
    lines.push(`1 FILE ${item.path}`);
    lines.push(`2 FORM ${format === '7' ? item.mime_type : (FORM_551[item.mime_type] ?? 'bin')}`);
    lines.push(`${format === '7' ? '3' : '2'} TITL ${item.original_filename}`.replace(/\n/g, ' '));
  }
  lines.push('0 TRLR');
  return `${finalizeLines(lines).join('\n')}\n`;
}

// Un retour à la ligne dans une valeur casserait la structure du fichier (un
// nom « Ada\n0 TRLR » fermerait le fichier). Les textes longs (NOTE, TEXT)
// l'expriment avec CONT, comme le prévoit la norme ; partout ailleurs il est
// remplacé par une espace. Les lignes trop longues sont coupées en CONC.
const MULTILINE_TAGS = new Set(['NOTE', 'TEXT', 'QUOT']);
const MAX_LINE_VALUE = 240;

function finalizeLines(lines) {
  const result = [];
  for (const line of lines) {
    const match = /^(\d+) (@[^@]+@ )?(\S+)(?: ([\s\S]*))?$/.exec(line);
    if (!match) {
      result.push(line.replace(/[\r\n]+/g, ' '));
      continue;
    }
    const [, level, xref = '', tag, value = ''] = match;
    const head = `${level} ${xref}${tag}`;
    const parts = MULTILINE_TAGS.has(tag)
      ? value.split(/\r\n|\r|\n/)
      : [value.replace(/[\r\n]+/g, ' ')];
    parts.forEach((part, index) => {
      const chunks = [];
      // Coupure jamais devant une espace : le lecteur ignore les espaces qui
      // suivent la balise et perdrait celle du début du morceau.
      for (let start = 0; start < part.length || start === 0;) {
        let end = Math.min(start + MAX_LINE_VALUE, part.length);
        while (end < part.length && part[end] === ' ') end += 1;
        chunks.push(part.slice(start, end));
        if (end >= part.length) break;
        start = end;
      }
      const subLevel = Number(level) + 1;
      chunks.forEach((chunk, chunkIndex) => {
        if (index === 0 && chunkIndex === 0) result.push(chunk === '' ? head : `${head} ${chunk}`);
        else {
          const continuation = chunkIndex === 0 ? 'CONT' : 'CONC';
          result.push(`${subLevel} ${continuation}${chunk === '' ? '' : ` ${chunk}`}`);
        }
      });
    });
  }
  return result;
}

/**
 * Un export est relu par notre propre parser avant d'être remis : un fichier
 * que GeneoApp ne saurait pas relire (ou qui perd des personnes ou des
 * familles) ne doit jamais atteindre l'utilisateur. Un échec ici est un bogue
 * de l'export, pas une erreur de saisie : il est signalé comme erreur interne.
 */
function verifyExport(gedcom, expected) {
  const records = parseGedcom(gedcom);
  const report = validateGedcom(records);
  const problems = report.errors.filter(
    (error) => !(error.code === 'MISSING_INDIVIDUALS' && expected.persons === 0),
  );
  if (report.summary.individuals !== expected.persons) {
    problems.push({
      code: 'COUNT_MISMATCH',
      message: `${report.summary.individuals} individu(s) relus pour ${expected.persons} exporté(s)`,
    });
  }
  if (report.summary.families !== expected.families) {
    problems.push({
      code: 'COUNT_MISMATCH',
      message: `${report.summary.families} famille(s) relues pour ${expected.families} exportée(s)`,
    });
  }
  if (problems.length > 0) {
    const error = new Error(
      `Export GEDCOM invalide, non remis : ${problems.map((p) => p.message).join(' ; ')}`,
    );
    error.code = 'GEDCOM_EXPORT_VERIFICATION_FAILED';
    throw error;
  }
}

// Balises que l'import sait représenter, par type d'enregistrement : tout le
// reste est conservé tel quel (gedcom_extensions) et signalé dans le rapport.
const KNOWN_TAGS = {
  INDI: new Set([
    'NAME',
    'SEX',
    'NICK',
    'NOTE',
    'SOUR',
    'RESN',
    'REFN',
    'FAMS',
    'FAMC',
    'OBJE',
    'TITL',
    ...Object.keys(EVENT_TAGS),
  ]),
  FAM: new Set(['HUSB', 'WIFE', 'CHIL', 'MARR', 'DIV', 'NOTE', 'SOUR', '_NOUNION']),
  EVENT: new Set(['DATE', 'PLAC', 'NOTE', 'SOUR', 'TYPE']),
};

/** Sous-éléments d'un enregistrement que le modèle ne représente pas. */
function unknownNodes(record, kind) {
  return record.children.filter((node) => {
    if (kind === 'INDI' && node.tag === 'EVEN') return !resolveEventType(node);
    return !KNOWN_TAGS[kind].has(node.tag);
  });
}

// Un pointeur (@I2@) vers une personne importée est réécrit avec son nouvel
// identifiant ; tout autre pointeur ne désigne plus rien dans la base et est
// vidé, pour que l'export ne produise jamais de référence orpheline.
function serializeNode(node, personIds) {
  const raw = node.value ?? '';
  const isPointer = /^@[^@]+@$/.test(raw.trim());
  const value = isPointer
    ? personIds.has(raw.trim())
      ? `@I${personIds.get(raw.trim())}@`
      : ''
    : raw;
  return {
    tag: node.tag,
    value,
    children: node.children.map((child) => serializeNode(child, personIds)),
  };
}

/** Balises non représentées, comptées par enregistrement d'origine (INDI, FAM, événement). */
function buildUnmappedPreview(records) {
  const counts = new Map();
  const add = (where, node) => {
    const key = `${where}:${node.tag}`;
    counts.set(key, { where, tag: node.tag, count: (counts.get(key)?.count ?? 0) + 1 });
  };
  for (const record of records) {
    if (record.tag === 'INDI') {
      unknownNodes(record, 'INDI').forEach((node) => add('INDI', node));
      record.children
        .filter((node) => node.tag !== 'EVEN' && resolveEventType(node))
        .forEach((event) => unknownNodes(event, 'EVENT').forEach((node) => add('EVENT', node)));
    } else if (record.tag === 'FAM') {
      unknownNodes(record, 'FAM').forEach((node) => add('FAM', node));
      for (const tag of ['MARR', 'DIV']) {
        children(record, tag).forEach((event) =>
          unknownNodes(event, 'EVENT').forEach((node) => add('EVENT', node)),
        );
      }
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** Contenus annexes du fichier : sources, notes partagées et citations. */
function buildContentsPreview(records) {
  let citations = 0;
  const visit = (record) => {
    for (const node of record.children) {
      if (node.tag === 'SOUR') citations += 1;
      visit(node);
    }
  };
  records.filter((record) => ['INDI', 'FAM'].includes(record.tag)).forEach(visit);
  return {
    sources: records.filter((record) => record.tag === 'SOUR').length,
    notes: records.filter((record) => record.tag === 'NOTE').length,
    citations,
  };
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
  const ids = {
    persons: [],
    events: [],
    unions: [],
    parentages: [],
    sources: [],
    citations: [],
    extensions: [],
  };
  const insertPerson = database.prepare(
    `INSERT INTO persons (
       given_names, family_name, birth_family_name, sex, notes, nickname, external_id, is_living,
       alias, married_name, title, suffix, is_private
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertIdentifier = database.prepare(
    `INSERT OR IGNORE INTO person_identifiers (person_id, scheme, value) VALUES (?, ?, ?)`,
  );
  const insertPlace = database.prepare(`INSERT INTO places (name, normalized_name) VALUES (?, ?)`);
  const insertEvent = database.prepare(
    `INSERT INTO events (type, date_text, date_precision, place_id, notes, value) VALUES (?, ?, ?, ?, ?, ?)`,
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
  const ctx = createImportContext(database, records, ids, performedBy, personIds);
  // Une même filiation ne peut être insérée deux fois (index unique).
  const insertedPairs = new Set();

  for (const person of records.filter((record) => record.tag === 'INDI')) {
    const nameRecords = children(person, 'NAME');
    const name = parseName(nameRecords[0]?.value);
    const otherNames = readOtherNames(nameRecords.slice(1));
    const ownEvents = [
      ...children(person, 'DEAT').map(() => ({ type: 'DEATH' })),
      ...children(person, 'BURI').map(() => ({ type: 'BURIAL' })),
      ...children(person, 'BIRT').map((record) => ({
        type: 'BIRTH',
        dateText: value(record, 'DATE'),
      })),
      ...children(person, 'BAPM').map((record) => ({
        type: 'BAPTISM',
        dateText: value(record, 'DATE'),
      })),
    ];
    const result = insertPerson.run(
      name.givenNames,
      name.familyName,
      otherNames.birthFamilyName,
      sex(value(person, 'SEX')),
      ctx.notes(person),
      value(person, 'NICK') ?? null,
      person.xref ?? null,
      // Décès/inhumation connus, ou naissance/baptême de plus de 110 ans :
      // la personne est présumée non-vivante.
      shouldBeDeceased(ownEvents) ? 0 : 1,
      otherNames.alias,
      otherNames.marriedName,
      value(nameRecords[0], 'NPFX') ?? value(person, 'TITL') ?? null,
      value(nameRecords[0], 'NSFX') ?? null,
      /^(privacy|confidential)$/i.test(value(person, 'RESN') ?? '') ? 1 : 0,
    );
    for (const reference of children(person, 'REFN')) {
      const scheme = (value(reference, 'TYPE') ?? 'REFN').trim().toUpperCase().replace(/\W+/g, '_');
      if (reference.value?.trim() && scheme) {
        insertIdentifier.run(result.lastInsertRowid, scheme.slice(0, 40), reference.value.trim());
      }
    }
    personIds.set(person.xref, result.lastInsertRowid);
    ids.persons.push(result.lastInsertRowid);
    ctx.citationsOf(person, 'PERSON', result.lastInsertRowid);
    audit(database, 'persons', result.lastInsertRowid, { xref: person.xref }, performedBy);
  }

  for (const person of records.filter((record) => record.tag === 'INDI')) {
    // Après l'insertion de toutes les personnes : les pointeurs peuvent viser une
    // personne définie plus loin dans le fichier.
    ctx.keepExtensions(person, 'INDI', 'PERSON', personIds.get(person.xref));
    for (const event of person.children.filter((child) => resolveEventType(child))) {
      const eventId = insertEventRecord(
        database,
        ctx,
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
          ctx,
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
          ctx,
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
      : insertUnion.run(unionTypeOf(marriage), startEventId, endEventId, ctx.notes(family));
    if (union) {
      ids.unions.push(union.lastInsertRowid);
      ctx.citationsOf(family, 'UNION', union.lastInsertRowid);
      ctx.keepExtensions(family, 'FAM', 'UNION', union.lastInsertRowid);
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
  ctx,
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
      if (!placeId) {
        placeId = insertPlace.run(placeName.trim(), normalized).lastInsertRowid;
        const coordinates = readCoordinates(child(record, 'PLAC'));
        if (coordinates) {
          database
            .prepare('UPDATE places SET latitude = ?, longitude = ? WHERE id = ?')
            .run(coordinates.latitude, coordinates.longitude, placeId);
        }
      }
      placeIds.set(normalized, placeId);
    }
  }
  const result = insertEvent.run(
    type,
    value(record, 'DATE'),
    datePrecision(value(record, 'DATE')),
    placeId,
    ctx.notes(record),
    record.value?.trim() || null,
  );
  audit(database, 'events', result.lastInsertRowid, { type }, performedBy);
  ctx.citationsOf(record, 'EVENT', result.lastInsertRowid);
  ctx.keepExtensions(record, 'EVENT', 'EVENT', result.lastInsertRowid);
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

// Noms secondaires d'un INDI (NAME répétés) : le type GEDCOM (TYPE) dit s'il
// s'agit du nom de naissance, du nom marital ou d'un alias.
function readOtherNames(records) {
  const result = { birthFamilyName: null, marriedName: null, alias: null };
  for (const record of records) {
    const type = (value(record, 'TYPE') ?? '').trim().toUpperCase();
    const surname = /\/([^/]*)\//.exec(record.value ?? '')?.[1]?.trim() || null;
    if ((type === 'BIRTH' || type === 'MAIDEN') && surname) result.birthFamilyName ??= surname;
    else if (type === 'MARRIED' && surname) result.marriedName ??= surname;
    else if (type === 'AKA') {
      result.alias ??= (record.value ?? '').replace(/\//g, ' ').replace(/\s+/g, ' ').trim() || null;
    }
  }
  return result;
}

function sex(value) {
  return ['M', 'F'].includes(value) ? value : 'U';
}

function datePrecision(value) {
  if (!value) return 'UNKNOWN';
  if (/^ABT\b/i.test(value)) return 'ABOUT';
  if (/^EST\b/i.test(value)) return 'ESTIMATED';
  if (/^CAL\b/i.test(value)) return 'CALCULATED';
  if (/^BEF\b/i.test(value)) return 'BEFORE';
  if (/^AFT\b/i.test(value)) return 'AFTER';
  if (/^BET\b/i.test(value)) return 'BETWEEN';
  return 'EXACT';
}

// Type d'union d'après le sous-élément TYPE de MARR (« civil partnership »,
// « cohabitation »…) ; un MARR sans précision est un mariage.
function unionTypeOf(marriage) {
  if (!marriage) return 'OTHER';
  const kind = (value(marriage, 'TYPE') ?? '').toLowerCase();
  if (/civil|pacs|partnership|pacte/.test(kind)) return 'CIVIL_PARTNERSHIP';
  if (/cohab|libre|concubin/.test(kind)) return 'COHABITATION';
  return 'MARRIAGE';
}

// « N48.8566 » / « W2.35 » → nombre signé ; null si le format est inconnu.
function parseCoordinate(raw, positive, negative) {
  const match = new RegExp(`^([${positive}${negative}])\\s*(-?\\d+(?:\\.\\d+)?)$`, 'i').exec(
    (raw ?? '').trim(),
  );
  if (!match) return null;
  const magnitude = Math.abs(Number(match[2]));
  return match[1].toUpperCase() === negative ? -magnitude : magnitude;
}

function readCoordinates(placeRecord) {
  const map = child(placeRecord, 'MAP');
  const latitude = parseCoordinate(value(map, 'LATI'), 'N', 'S');
  const longitude = parseCoordinate(value(map, 'LONG'), 'E', 'W');
  if (latitude === null || longitude === null) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

const QUAY_TO_CONFIDENCE = { 0: 'LOW', 1: 'LOW', 2: 'MEDIUM', 3: 'HIGH' };

/**
 * Contexte d'un import : résolution des notes partagées (NOTE @N1@), sources
 * (enregistrements SOUR, ou source en ligne) et citations. Les sources sont
 * créées avant les personnes et événements qui les citent.
 */
function createImportContext(database, records, ids, performedBy, personIds) {
  const noteRecords = new Map(
    records.filter((record) => record.tag === 'NOTE' && record.xref).map((r) => [r.xref, r]),
  );
  const notes = (record) =>
    children(record, 'NOTE')
      .map((note) => {
        const shared = noteRecords.get((note.value ?? '').trim());
        return shared ? shared.value : note.value;
      })
      .join('\n') || null;

  const insertSource = database.prepare(
    'INSERT INTO sources (title, author, publication_info) VALUES (?, ?, ?)',
  );
  const insertCitation = database.prepare(
    `INSERT INTO citations (source_id, entity_type, entity_id, page, confidence, notes, quotation)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const sourceIds = new Map();
  const createSource = (title, author, publication) => {
    const info = insertSource.run(title.slice(0, 300), author, publication);
    ids.sources.push(info.lastInsertRowid);
    audit(database, 'sources', info.lastInsertRowid, { title }, performedBy);
    return info.lastInsertRowid;
  };
  for (const record of records.filter((r) => r.tag === 'SOUR' && r.xref)) {
    const title = value(record, 'TITL') ?? value(record, 'ABBR') ?? 'Source sans titre';
    sourceIds.set(record.xref, createSource(title, value(record, 'AUTH'), value(record, 'PUBL')));
  }
  const inlineSources = new Map();
  const insertExtension = database.prepare(
    `INSERT INTO gedcom_extensions (entity_type, entity_id, tag, payload, position)
     VALUES (?, ?, ?, ?, ?)`,
  );

  return {
    notes,
    keepExtensions(record, kind, entityType, entityId) {
      unknownNodes(record, kind).forEach((node, position) => {
        insertExtension.run(
          entityType,
          entityId,
          node.tag.slice(0, 40),
          JSON.stringify(serializeNode(node, personIds)),
          position,
        );
        ids.extensions.push(1);
      });
    },
    citationsOf(record, entityType, entityId) {
      for (const citation of children(record, 'SOUR')) {
        const reference = (citation.value ?? '').trim();
        let sourceId = sourceIds.get(reference);
        if (!sourceId) {
          // Source en ligne (texte libre) : une source par texte distinct.
          const title = reference || 'Source sans titre';
          if (!inlineSources.has(title)) inlineSources.set(title, createSource(title, null, null));
          sourceId = inlineSources.get(title);
        }
        const quay = value(citation, 'QUAY');
        const info = insertCitation.run(
          sourceId,
          entityType,
          entityId,
          value(citation, 'PAGE'),
          QUAY_TO_CONFIDENCE[quay] ?? 'MEDIUM',
          notes(citation),
          value(child(citation, 'DATA'), 'TEXT'),
        );
        ids.citations.push(info.lastInsertRowid);
        audit(
          database,
          'citations',
          info.lastInsertRowid,
          { sourceId, entityType, entityId },
          performedBy,
        );
      }
    },
  };
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
  if (famc && value(famc, '_GUARDIAN')) return 'GUARDIAN';
  const pedigree = famc ? value(famc, 'PEDI')?.toUpperCase() : null;
  return PEDIGREE_TO_LINK[pedigree] ?? 'BIOLOGICAL';
}
