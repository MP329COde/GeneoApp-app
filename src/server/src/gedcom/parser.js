import { ValidationError } from '../errors.js';

const SUPPORTED_VERSIONS = new Set(['5.5', '5.5.1', '7', '7.0']);

export function parseGedcom(input) {
  if (typeof input !== 'string' || input.trim() === '') {
    throw new ValidationError('Le contenu GEDCOM doit être une chaîne non vide');
  }

  const lines = input
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n');
  const records = [];
  const stack = [];
  let previous = null;

  lines.forEach((line, index) => {
    if (line === '') return;
    const match = /^(\d+)\s+(?:(@[^@]+@)\s+)?([^ ]+)(?:\s+(.*))?$/.exec(line);
    if (!match) {
      throw new ValidationError(`Ligne GEDCOM invalide ${index + 1}`);
    }

    const [, levelText, xref, tag, value = ''] = match;
    const level = Number(levelText);
    const node = { level, xref: xref ?? null, tag, value, line: index + 1, children: [] };

    if (level === 0) {
      records.push(node);
      stack.length = 0;
      stack.push(node);
    } else if (stack.length === 0 || level > stack.length) {
      throw new ValidationError(`Niveau GEDCOM inattendu à la ligne ${index + 1}`);
    } else {
      stack.length = level;
      const parent = stack[level - 1];
      parent.children.push(node);
      stack.push(node);
    }

    if (tag === 'CONC' && previous) {
      previous.value += value;
      if (previous.children.at(-1) === node) previous.children.pop();
    } else if (tag === 'CONT' && previous) {
      previous.value += `\n${value}`;
      if (previous.children.at(-1) === node) previous.children.pop();
    } else {
      previous = node;
    }
  });

  return records;
}

export function validateGedcom(records) {
  const errors = [];
  const warnings = [];
  const xrefs = new Map();
  const rootTags = new Set(['HEAD', 'INDI', 'FAM', 'TRLR', 'NOTE', 'SOUR', 'SUBM', 'REPO']);

  for (const record of records) {
    if (record.level !== 0) errors.push(issue(record, 'Le niveau racine doit être 0'));
    if (!rootTags.has(record.tag))
      warnings.push(issue(record, `Tag racine ignoré : ${record.tag}`));
    if (record.xref) {
      if (xrefExists(xrefs, record.xref))
        errors.push(issue(record, `Référence dupliquée : ${record.xref}`));
      xrefs.set(record.xref, record);
    }
  }

  const header = records.find((record) => record.tag === 'HEAD');
  const version = childValue(child(header, 'GEDC'), 'VERS') ?? childValue(header, 'VERS');
  if (!header) errors.push({ code: 'MISSING_HEAD', message: 'Le fichier doit contenir HEAD' });
  if (!version)
    errors.push({ code: 'MISSING_VERSION', message: 'La version GEDCOM est obligatoire' });
  else if (!SUPPORTED_VERSIONS.has(version))
    errors.push({
      code: 'UNSUPPORTED_VERSION',
      message: `Version GEDCOM non supportée : ${version}`,
    });

  const individuals = records.filter((record) => record.tag === 'INDI');
  const families = records.filter((record) => record.tag === 'FAM');
  if (individuals.length === 0)
    errors.push({ code: 'MISSING_INDIVIDUALS', message: 'Aucun individu GEDCOM' });

  for (const person of individuals) {
    if (!child(person, 'NAME')) errors.push(issue(person, 'INDI sans NAME'));
    checkReferences(person, ['FAMS', 'FAMC'], xrefs, errors);
  }
  for (const family of families)
    checkReferences(family, ['HUSB', 'WIFE', 'CHIL'], xrefs, errors, ['INDI']);

  return {
    valid: errors.length === 0,
    version: version ?? null,
    errors,
    warnings,
    summary: {
      individuals: individuals.length,
      families: families.length,
      records: records.length,
    },
  };
}

function checkReferences(record, tags, xrefs, errors, expectedTags = null) {
  for (const tag of tags) {
    for (const reference of children(record, tag)) {
      if (!xrefExists(xrefs, reference.value)) {
        errors.push(issue(reference, `Référence inconnue : ${reference.value}`));
      } else if (expectedTags && !expectedTags.includes(xrefs.get(reference.value).tag)) {
        errors.push(issue(reference, `Référence ${reference.value} de type inattendu`));
      }
    }
  }
}

function xrefExists(xrefs, value) {
  return xrefs.has(value);
}

function children(record, tag) {
  return record?.children.filter((childRecord) => childRecord.tag === tag) ?? [];
}

function child(record, tag) {
  return children(record, tag)[0] ?? null;
}

function childValue(record, tag) {
  return child(record, tag)?.value ?? null;
}

function issue(record, message) {
  return { code: 'INVALID_RECORD', line: record.line, message };
}

export { SUPPORTED_VERSIONS };
