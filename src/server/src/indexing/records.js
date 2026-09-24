import path from 'node:path';
import { decodeText } from './text-extract.js';

// Données ouvertes (ADR 0012) : un fichier structuré est découpé en lots
// d'enregistrements, chacun indexé comme un document. Une recherche renvoie
// ainsi le lot contenant la personne, avec un extrait lisible, au lieu d'un
// fichier de plusieurs centaines de milliers de lignes.

export const RECORD_LIMITS = Object.freeze({ recordsPerChunk: 200, textChunkChars: 50_000 });

// Fichier INSEE des personnes décédées (depuis 1970), lignes à largeur fixe :
// nom*prénoms/ (80), sexe (1), naissance AAAAMMJJ (8), code lieu (5), commune
// (30), pays (30), décès AAAAMMJJ (8), code lieu (5), numéro d'acte (9).
const INSEE_FIELDS = [
  ['name', 0, 80],
  ['sex', 80, 81],
  ['birthDate', 81, 89],
  ['birthCode', 89, 94],
  ['birthPlace', 94, 124],
  ['birthCountry', 124, 154],
  ['deathDate', 154, 162],
  ['deathCode', 162, 167],
  ['act', 167, 176],
];

export function looksLikeInseeDeaths(lines) {
  const sample = lines.filter(Boolean).slice(0, 20);
  return (
    sample.length > 0 &&
    sample.every(
      (line) =>
        line.length >= 162 &&
        line.length <= 220 &&
        /^[^*/]+\*[^/]*\/?/.test(line.slice(0, 80)) &&
        /^\d{8}$/.test(line.slice(154, 162).trim() || '00000000'),
    )
  );
}

function frenchDate(value) {
  const [, year, month, day] = /^(\d{4})(\d{2})(\d{2})$/.exec(value ?? '') ?? [];
  if (!year || year === '0000') return null;
  if (month === '00') return year;
  if (day === '00') return `${month}/${year}`;
  return `${day}/${month}/${year}`;
}

/** Ligne INSEE rendue lisible, par ex. « LEFEVRE Jean Baptiste, né le … à … ». */
export function formatInseeDeath(line) {
  const field = Object.fromEntries(
    INSEE_FIELDS.map(([key, start, end]) => [key, line.slice(start, end).trim()]),
  );
  const [surname = '', given = ''] = field.name.replace(/\/$/, '').split('*');
  const female = field.sex === '2';
  const birth = frenchDate(field.birthDate);
  const death = frenchDate(field.deathDate);
  const place = [field.birthPlace, field.birthCountry].filter(Boolean).join(', ');
  return [
    `${surname.trim()} ${given.replace(/\s+/g, ' ').trim()}`.trim(),
    birth
      ? `${female ? 'née' : 'né'} le ${birth}${place ? ` à ${place}` : ''}${field.birthCode ? ` (${field.birthCode})` : ''}`
      : null,
    death
      ? `${female ? 'décédée' : 'décédé'} le ${death}${field.deathCode ? ` (lieu ${field.deathCode})` : ''}`
      : null,
    field.act ? `acte ${field.act}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Analyse CSV (RFC 4180) avec détection du séparateur ; , tabulation |. */
export function parseCsv(text) {
  const [firstLine = ''] = text.split(/\r?\n/, 1);
  const delimiter = [';', ',', '\t', '|']
    .map((candidate) => [candidate, firstLine.split(candidate).length])
    .sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell === '') quoted = true;
    else if (char === delimiter) {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell);
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += char;
  }
  row.push(cell);
  if (row.some((value) => value !== '')) rows.push(row);
  const [header = [], ...records] = rows;
  return { columns: header.map((name) => name.trim()), records };
}

function formatCsvRecord(columns, values) {
  return values
    .map((value, index) => [columns[index] || `col${index + 1}`, value.trim()])
    .filter(([, value]) => value !== '')
    .map(([name, value]) => `${name} : ${value}`)
    .join(' · ');
}

function flatten(value, prefix = '') {
  if (value === null || value === undefined || value === '') return [];
  if (Array.isArray(value)) return value.flatMap((item) => flatten(item, prefix));
  if (typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) =>
      flatten(item, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [`${prefix || 'valeur'} : ${String(value)}`];
}

/** Enregistrements d'un JSON : tableau racine, GeoJSON, ou tableau data/records/results. */
export function jsonRecords(text) {
  const data = JSON.parse(text);
  const list = Array.isArray(data)
    ? data
    : Array.isArray(data?.features)
      ? data.features.map((feature) => feature?.properties ?? feature)
      : (['data', 'records', 'results', 'items', 'rows']
          .map((key) => data?.[key])
          .find(Array.isArray) ?? [data]);
  return list.map((item) => flatten(item).join(' · ')).filter(Boolean);
}

/** Enregistrements de niveau 0 d'un fichier GEDCOM (individus, familles, sources…). */
export function gedcomRecords(text) {
  return text
    .split(/\r?\n(?=0 )/)
    .map((record) => record.trim())
    .filter((record) => /^0 @[^@]+@ (INDI|FAM|SOUR|NOTE|OBJE|REPO)/.test(record));
}

function groupRecords(records, size, title) {
  const chunks = [];
  for (let start = 0; start < records.length; start += size) {
    const slice = records.slice(start, start + size);
    chunks.push({
      key: String(chunks.length + 1),
      title: `${title} — enregistrements ${start + 1} à ${start + slice.length}`,
      text: slice.join('\n'),
      count: slice.length,
    });
  }
  return chunks;
}

function splitText(text, size, title) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + size);
    if (end < text.length) {
      const breakAt = text.lastIndexOf('\n', end);
      if (breakAt > start + size / 2) end = breakAt;
    }
    chunks.push({
      key: String(chunks.length + 1),
      title:
        chunks.length === 0 && end >= text.length
          ? title
          : `${title} — partie ${chunks.length + 1}`,
      text: text.slice(start, end).trim(),
    });
    start = end;
  }
  return chunks;
}

const STRUCTURED_EXTENSIONS = new Set(['.csv', '.tsv', '.json', '.geojson', '.ged', '.txt']);

export function isStructuredData(filename, mimeType = '') {
  return (
    STRUCTURED_EXTENSIONS.has(path.extname(filename).toLowerCase()) ||
    /^(text\/(csv|plain|tab-separated-values)|application\/(json|geo\+json))\b/i.test(mimeType)
  );
}

/**
 * Découpe un fichier de données en lots indexables.
 * Retourne { format, records, chunks: [{ key, title, text }] }.
 */
export function recordChunks({ buffer, filename, mimeType = '', limits = RECORD_LIMITS }) {
  const text = decodeText(buffer, mimeType);
  const extension = path.extname(filename).toLowerCase();
  const title = path.basename(filename);
  const size = limits.recordsPerChunk;
  const lines = text.split(/\r?\n/);

  if (looksLikeInseeDeaths(lines)) {
    const records = lines.filter((line) => line.trim()).map(formatInseeDeath);
    return {
      format: 'insee-deces',
      records: records.length,
      chunks: groupRecords(records, size, title),
    };
  }
  if (extension === '.ged' || /^0 HEAD\b/.test(text)) {
    const records = gedcomRecords(text);
    return {
      format: 'gedcom',
      records: records.length,
      chunks: groupRecords(records, size, title),
    };
  }
  if (['.json', '.geojson'].includes(extension) || /json/i.test(mimeType)) {
    try {
      const records = jsonRecords(text);
      return {
        format: 'json',
        records: records.length,
        chunks: groupRecords(records, size, title),
      };
    } catch {
      // JSON invalide : indexé comme texte brut.
    }
  }
  if (['.csv', '.tsv'].includes(extension) || /csv|tab-separated/i.test(mimeType)) {
    const { columns, records } = parseCsv(text);
    const formatted = records.map((values) => formatCsvRecord(columns, values)).filter(Boolean);
    return {
      format: 'csv',
      records: formatted.length,
      chunks: groupRecords(formatted, size, title),
    };
  }
  const chunks = splitText(text.trim(), limits.textChunkChars, title).filter((chunk) => chunk.text);
  return { format: 'text', records: chunks.length, chunks };
}
