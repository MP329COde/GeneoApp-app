/**
 * Dates généalogiques : lecture tolérante (français, anglais, GEDCOM,
 * formats numériques), approximations, intervalles et doute explicite.
 * Module pur, partagé par le serveur (tri, cohérence) et le client
 * (affichage). Une date n'est jamais « devinée » : ce qui n'est pas compris
 * reste `UNKNOWN` avec son texte d'origine.
 */

const MONTHS = new Map(
  Object.entries({
    1: ['janvier', 'janv', 'jan', 'january'],
    2: ['février', 'fevrier', 'févr', 'fevr', 'fév', 'fev', 'feb', 'february'],
    3: ['mars', 'mar', 'march'],
    4: ['avril', 'avr', 'apr', 'april'],
    5: ['mai', 'may'],
    6: ['juin', 'jun', 'june'],
    7: ['juillet', 'juil', 'jul', 'july'],
    8: ['août', 'aout', 'aug', 'august'],
    9: ['septembre', 'sept', 'sep', 'september'],
    10: ['octobre', 'oct', 'october'],
    11: ['novembre', 'nov', 'november'],
    12: ['décembre', 'decembre', 'déc', 'dec', 'december'],
  }).flatMap(([month, names]) => names.map((name) => [name, Number(month)])),
);

const FR_MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];
const GEDCOM_MONTHS = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
];

// Marge d'une date « vers » : ± 2 ans (convention usuelle en généalogie).
export const ABOUT_MARGIN_YEARS = 2;

const QUALIFIERS = [
  {
    kind: 'ABOUT',
    pattern: /^(?:vers|v\.|env\.?|environ|circa|ca\.?|c\.|about|abt\.?|approx\.?)\s+/i,
  },
  { kind: 'ESTIMATED', pattern: /^(?:est\.?|estimé(?:e)?|estimated)\s+/i },
  { kind: 'CALCULATED', pattern: /^(?:cal\.?|calculé(?:e)?|calculated)\s+/i },
  { kind: 'BEFORE', pattern: /^(?:avant|av\.|avt|before|bef\.?)\s+/i },
  { kind: 'AFTER', pattern: /^(?:après|apres|ap\.|apr\.|after|aft\.?)\s+/i },
];
const RANGE_PATTERNS = [
  /^(?:entre|between|bet\.?)\s+(.+?)\s+(?:et|and|&)\s+(.+)$/i,
  /^(?:de|du|from)\s+(.+?)\s+(?:à|au|a|to)\s+(.+)$/i,
];

function dayCount(year, month, day) {
  return year * 372 + (month - 1) * 31 + (day - 1);
}

function parsePoint(text) {
  const value = text.trim().replace(/\s+/g, ' ');
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match) return point(Number(match[1]), Number(match[2]), Number(match[3]));
  match = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(value);
  if (match) return point(Number(match[3]), Number(match[2]), Number(match[1]));
  match = /^(\d{1,2})[/.](\d{4})$/.exec(value);
  if (match) return point(Number(match[2]), Number(match[1]));
  match = /^(\d{3,4})$/.exec(value);
  if (match) return point(Number(match[1]));
  match = /^(?:(\d{1,2})(?:er)?\s+)?([a-zA-ZÀ-ÿ.]+)\s+(\d{3,4})$/.exec(value);
  if (match) {
    const month = MONTHS.get(match[2].toLowerCase().replace(/\.$/, ''));
    if (!month) return null;
    return point(Number(match[3]), month, match[1] ? Number(match[1]) : undefined);
  }
  return null;
}

function point(year, month, day) {
  if (!Number.isInteger(year) || year < 100 || year > 2999) return null;
  if (month !== undefined && (month < 1 || month > 12)) return null;
  if (day !== undefined) {
    const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (day < 1 || day > days) return null;
  }
  return { year, ...(month ? { month } : {}), ...(day ? { day } : {}) };
}

function lowerBound(p) {
  return dayCount(p.year, p.month ?? 1, p.day ?? 1);
}

function upperBound(p) {
  return dayCount(p.year, p.month ?? 12, p.day ?? 31);
}

/**
 * Analyse une date saisie. Retourne `{ kind, start, end, uncertain, min,
 * max, sortKey, valid, original }` ; `min`/`max` sont des bornes comparables
 * (jours approximatifs), `null` quand ouvertes (avant / après).
 */
export function parseGenealogyDate(input) {
  const original = typeof input === 'string' ? input : '';
  let text = original.trim().replace(/\s+/g, ' ');
  const unknown = {
    original,
    kind: 'UNKNOWN',
    start: null,
    end: null,
    uncertain: false,
    min: null,
    max: null,
    sortKey: null,
    valid: false,
  };
  if (text === '') return unknown;

  let uncertain = false;
  if (/\s*\?$/.test(text)) {
    uncertain = true;
    text = text.replace(/\s*\?$/, '');
  }

  for (const pattern of RANGE_PATTERNS) {
    const match = pattern.exec(text);
    if (match) {
      const start = parsePoint(match[1]);
      const end = parsePoint(match[2]);
      if (!start || !end || lowerBound(start) > upperBound(end)) return { ...unknown, uncertain };
      return {
        original,
        kind: 'BETWEEN',
        start,
        end,
        uncertain,
        min: lowerBound(start),
        max: upperBound(end),
        sortKey: (lowerBound(start) + upperBound(end)) / 2,
        valid: true,
      };
    }
  }

  let kind = 'EXACT';
  for (const qualifier of QUALIFIERS) {
    if (qualifier.pattern.test(text)) {
      kind = qualifier.kind;
      text = text.replace(qualifier.pattern, '');
      break;
    }
  }
  const start = parsePoint(text);
  if (!start) return { ...unknown, uncertain };
  const low = lowerBound(start);
  const high = upperBound(start);
  const margin = ABOUT_MARGIN_YEARS * 372;
  const approximate = kind === 'ABOUT' || kind === 'ESTIMATED';
  return {
    original,
    kind,
    start,
    end: null,
    uncertain,
    min: kind === 'BEFORE' ? null : approximate ? low - margin : low,
    max: kind === 'AFTER' ? null : approximate ? high + margin : high,
    sortKey: (low + high) / 2,
    valid: true,
  };
}

/** Année représentative (tri, statistiques), ou null. */
export function yearOf(input) {
  const parsed = typeof input === 'string' ? parseGenealogyDate(input) : input;
  if (!parsed?.valid) return null;
  if (parsed.kind === 'BETWEEN') return Math.round((parsed.start.year + parsed.end.year) / 2);
  return parsed.start.year;
}

/** Compare deux dates pour un tri chronologique (inconnues en dernier). */
export function compareGenealogyDates(a, b) {
  const left = typeof a === 'string' ? parseGenealogyDate(a) : a;
  const right = typeof b === 'string' ? parseGenealogyDate(b) : b;
  if (!left?.valid && !right?.valid) return 0;
  if (!left?.valid) return 1;
  if (!right?.valid) return -1;
  return left.sortKey - right.sortKey;
}

/**
 * Ordre certain entre deux dates : `before` si `a` est forcément avant `b`,
 * `after` si forcément après, `unknown` si les intervalles se chevauchent.
 */
export function certainOrder(a, b) {
  const left = typeof a === 'string' ? parseGenealogyDate(a) : a;
  const right = typeof b === 'string' ? parseGenealogyDate(b) : b;
  if (!left?.valid || !right?.valid) return 'unknown';
  if (left.max !== null && right.min !== null && left.max < right.min) return 'before';
  if (left.min !== null && right.max !== null && left.min > right.max) return 'after';
  return 'unknown';
}

/** Écart minimal et maximal en années entre deux dates (b − a). */
export function yearsBetween(a, b) {
  const left = typeof a === 'string' ? parseGenealogyDate(a) : a;
  const right = typeof b === 'string' ? parseGenealogyDate(b) : b;
  if (!left?.valid || !right?.valid) return null;
  const toYears = (days) => days / 372;
  return {
    min: left.max !== null && right.min !== null ? toYears(right.min - left.max) : null,
    max: left.min !== null && right.max !== null ? toYears(right.max - left.min) : null,
    typical: toYears(right.sortKey - left.sortKey),
  };
}

function formatPoint(p, style) {
  if (style === 'gedcom') {
    return [
      p.day ? String(p.day).padStart(2, '0') : null,
      p.month ? GEDCOM_MONTHS[p.month - 1] : null,
      p.year,
    ]
      .filter(Boolean)
      .join(' ');
  }
  return [
    p.day ? (p.day === 1 ? '1er' : String(p.day)) : null,
    p.month ? FR_MONTHS[p.month - 1] : null,
    p.year,
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * Affichage normalisé : `fr` (« vers 1812 », « entre 1820 et 1825 ») ou
 * `gedcom` (« ABT 1812 », « BET 1820 AND 1825 »). Texte d'origine si non compris.
 */
export function formatGenealogyDate(input, style = 'fr') {
  const parsed = typeof input === 'string' ? parseGenealogyDate(input) : input;
  if (!parsed?.valid) return parsed?.original ?? '';
  const g = style === 'gedcom';
  const main = formatPoint(parsed.start, style);
  let text;
  switch (parsed.kind) {
    case 'BETWEEN':
      text = g
        ? `BET ${main} AND ${formatPoint(parsed.end, style)}`
        : `entre ${main} et ${formatPoint(parsed.end, style)}`;
      break;
    case 'ABOUT':
      text = g ? `ABT ${main}` : `vers ${main}`;
      break;
    case 'ESTIMATED':
      text = g ? `EST ${main}` : `estimé ${main}`;
      break;
    case 'CALCULATED':
      text = g ? `CAL ${main}` : `calculé ${main}`;
      break;
    case 'BEFORE':
      text = g ? `BEF ${main}` : `avant ${main}`;
      break;
    case 'AFTER':
      text = g ? `AFT ${main}` : `après ${main}`;
      break;
    default:
      text = main;
  }
  return parsed.uncertain && !g ? `${text} ?` : text;
}

/** Précision stockée en base (events.date_precision) déduite du texte. */
export function precisionOf(input) {
  const parsed = typeof input === 'string' ? parseGenealogyDate(input) : input;
  if (!parsed?.valid) return 'UNKNOWN';
  if (parsed.kind === 'ESTIMATED' || parsed.kind === 'CALCULATED') return 'ABOUT';
  return parsed.kind;
}
