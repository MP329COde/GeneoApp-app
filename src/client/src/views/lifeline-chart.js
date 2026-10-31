// Calculs purs de la frise chronologique (lignes de vie).
//
// Ce module ne touche ni au DOM ni à React : il transforme les personnes et
// les événements en lignes de vie, choisit les graduations de l'axe des
// années et gère la fenêtre visible (zoom / déplacement horizontal). Il
// réutilise les constantes de gestes de `map-viewport.js` pour que la frise
// se manipule comme la carte.
import { parseGenealogyDate } from '../../../db/src/dates/genealogy-date.js';
import { GESTURE_THRESHOLD, KEYBOARD_PAN_STEP, ZOOM_FACTOR } from './map-viewport.js';

export { GESTURE_THRESHOLD, KEYBOARD_PAN_STEP, ZOOM_FACTOR };

/** Les dates sont converties en « années fractionnaires » (1812,5 = mi-1812). */
const DAYS_PER_YEAR = 372;

/** Largeur visuelle (en années) donnée à une borne ouverte (avant / après). */
export const OPEN_SPAN_YEARS = 8;

/** Fenêtre minimale affichable, en années. */
export const MIN_SPAN_YEARS = 2;

/** Marge ajoutée de part et d'autre de l'étendue des données, en années. */
export const EXTENT_PADDING_YEARS = 3;

/** Catégories de marqueurs : chacune a sa couleur ET sa forme. */
export const CATEGORIES = ['birth', 'marriage', 'death', 'other'];

export function categoryOf(type) {
  if (type === 'BIRTH') return 'birth';
  if (type === 'DEATH') return 'death';
  if (type === 'MARRIAGE') return 'marriage';
  return 'other';
}

/**
 * Position d'une date sur l'axe. Retourne null si la date est absente ou
 * incomprise ; sinon `{ at, from, to, imprecise, open, kind, uncertain }` :
 * `at` est la position du marqueur, `[from, to]` la plage d'incertitude
 * (réduite à un point pour une date exacte) et `open` vaut `before` ou
 * `after` quand une borne est ouverte.
 */
export function dateSpan(dateText) {
  const parsed = parseGenealogyDate(dateText ?? '');
  if (!parsed.valid) return null;
  const point = parsed.sortKey / DAYS_PER_YEAR;
  const kind = parsed.kind;
  if (kind === 'EXACT' && !parsed.uncertain) {
    return {
      at: point,
      from: point,
      to: point,
      imprecise: false,
      open: null,
      kind,
      uncertain: false,
    };
  }
  let from = parsed.min === null ? null : parsed.min / DAYS_PER_YEAR;
  let to = parsed.max === null ? null : parsed.max / DAYS_PER_YEAR;
  let open = null;
  if (from === null) {
    open = 'before';
    from = to - OPEN_SPAN_YEARS;
  } else if (to === null) {
    open = 'after';
    to = from + OPEN_SPAN_YEARS;
  }
  const at = open === 'before' ? to : open === 'after' ? from : (from + to) / 2;
  const imprecise = open !== null || to - from > 0.001 || kind !== 'EXACT' || parsed.uncertain;
  return { at, from, to, imprecise, open, kind, uncertain: parsed.uncertain };
}

/** Année entière affichable d'une position fractionnaire. */
export function yearLabel(value) {
  return String(Math.floor(value));
}

/** Année « actuelle » fractionnaire (injectable dans les tests). */
export function currentYear(date = new Date()) {
  return date.getFullYear() + date.getMonth() / 12;
}

function participantName(participant) {
  return `${participant.personGivenNames ?? ''} ${participant.personFamilyName ?? ''}`.trim();
}

/**
 * Construit les lignes de vie : une par personne ayant au moins un événement
 * daté. Une personne vivante (hors décès connu) a une ligne ouverte qui
 * court jusqu'à `now` ; une personne sans décès ni statut vivant s'arrête à
 * son dernier événement connu, avec une fin marquée « inconnue ». Aucun
 * décès n'est jamais inventé.
 */
export function buildLifelines(persons, events, { now = currentYear() } = {}) {
  const livingById = new Map((persons ?? []).map((person) => [person.id, person.is_living !== 0]));
  const byPerson = new Map();
  for (const event of events ?? []) {
    const span = dateSpan(event.date_text);
    if (!span) continue;
    for (const participant of event.participants ?? []) {
      if (!byPerson.has(participant.personId)) {
        byPerson.set(participant.personId, { name: participantName(participant), markers: [] });
      }
      byPerson.get(participant.personId).markers.push({
        key: `${participant.personId}:${event.id}`,
        eventId: event.id,
        personId: participant.personId,
        type: event.type,
        category: categoryOf(event.type),
        dateText: event.date_text,
        value: event.value ?? null,
        ...span,
      });
    }
  }

  const rows = [];
  for (const [personId, { name, markers }] of byPerson) {
    markers.sort((a, b) => a.at - b.at || a.eventId - b.eventId);
    const birth = markers.find((marker) => marker.category === 'birth');
    const death = markers.find((marker) => marker.category === 'death');
    const living = !death && livingById.get(personId) !== false;
    const first = markers[0];
    const last = markers[markers.length - 1];
    const start = birth ? birth.at : first.at;
    let end;
    let endKind;
    if (death) {
      end = death.at;
      endKind = 'death';
    } else if (living) {
      end = Math.max(now, last.to);
      endKind = 'living';
    } else {
      end = last.at;
      endKind = 'unknown';
    }
    rows.push({
      personId,
      name,
      markers,
      start,
      end: Math.max(start, end),
      startKnown: Boolean(birth),
      endKind,
      from: Math.min(start, ...markers.map((marker) => marker.from)),
      to: Math.max(end, ...markers.map((marker) => marker.to)),
    });
  }
  rows.sort((a, b) => a.start - b.start || a.name.localeCompare(b.name));
  return rows;
}

/** Étendue totale `{ start, end }` des lignes, avec marge ; null si vide. */
export function extentOf(rows) {
  if (!rows.length) return null;
  const start = Math.min(...rows.map((row) => row.from));
  const end = Math.max(...rows.map((row) => row.to));
  return {
    start: Math.floor(start - EXTENT_PADDING_YEARS),
    end: Math.ceil(end + EXTENT_PADDING_YEARS),
  };
}

const TICK_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];

/**
 * Pas des graduations : le plus petit pas « rond » qui donne au plus
 * `maxTicks` graduations sur la fenêtre.
 */
export function tickStep(span, maxTicks = 10) {
  const wanted = span / Math.max(1, maxTicks);
  return TICK_STEPS.find((step) => step >= wanted) ?? TICK_STEPS[TICK_STEPS.length - 1];
}

/** Graduations adaptatives de la fenêtre `{ start, end }` : `[{ value, major }]`. */
export function buildTicks(view, maxTicks = 10) {
  const span = view.end - view.start;
  const step = tickStep(span, maxTicks);
  const ticks = [];
  for (let value = Math.ceil(view.start / step) * step; value <= view.end; value += step) {
    ticks.push({ value, major: step >= 10 ? value % (step * 5) === 0 : value % 10 === 0 });
  }
  return ticks;
}

/** Position horizontale (unités du viewBox) d'une année dans la fenêtre. */
export function xOf(view, plot, value) {
  return plot.left + ((value - view.start) / (view.end - view.start)) * plot.width;
}

/** Borne la fenêtre dans l'étendue et à la durée minimale. */
export function clampView(view, extent) {
  const full = extent.end - extent.start;
  const span = Math.min(full, Math.max(Math.min(MIN_SPAN_YEARS, full), view.end - view.start));
  const start = Math.min(Math.max(view.start, extent.start), extent.end - span);
  return { start, end: start + span };
}

/** Zoom en gardant fixe l'année `anchor` (facteur > 1 : on se rapproche). */
export function zoomView(view, extent, factor, anchor) {
  const span = (view.end - view.start) / factor;
  const ratio = (anchor - view.start) / (view.end - view.start);
  const start = anchor - ratio * span;
  return clampView({ start, end: start + span }, extent);
}

/** Déplace la fenêtre de `years` années (positif : vers le futur). */
export function panView(view, extent, years) {
  return clampView({ start: view.start + years, end: view.end + years }, extent);
}

/** Niveau de zoom (1 = tout l'axe) pour l'affichage. */
export function zoomRatio(view, extent) {
  return (extent.end - extent.start) / (view.end - view.start);
}

/** Convertit un déplacement en unités du viewBox en années. */
export function unitsToYears(view, plot, units) {
  return (units / plot.width) * (view.end - view.start);
}

/**
 * Marqueur voisin pour la navigation au clavier. `rows` est la liste des
 * lignes affichées, `key` le marqueur courant, `direction` l'une des
 * flèches. Gauche / droite suivent la ligne ; haut / bas vont au marqueur
 * le plus proche dans le temps sur la ligne voisine.
 */
export function neighbourMarker(rows, key, direction) {
  const rowIndex = rows.findIndex((row) => row.markers.some((marker) => marker.key === key));
  if (rowIndex === -1) return rows[0]?.markers[0]?.key ?? null;
  const row = rows[rowIndex];
  const index = row.markers.findIndex((marker) => marker.key === key);
  if (direction === 'ArrowLeft') return row.markers[Math.max(0, index - 1)].key;
  if (direction === 'ArrowRight')
    return row.markers[Math.min(row.markers.length - 1, index + 1)].key;
  const target = rows[rowIndex + (direction === 'ArrowUp' ? -1 : 1)];
  if (!target) return key;
  const at = row.markers[index].at;
  return target.markers.reduce((best, marker) =>
    Math.abs(marker.at - at) < Math.abs(best.at - at) ? marker : best,
  ).key;
}
