// Placement des étiquettes de la carte hors ligne, sans collision.
//
// Fonction pure (aucun DOM) : pour chaque lieu, on essaie plusieurs
// positions de l'étiquette autour du repère (droite, gauche, dessus,
// dessous, puis diagonales). Une étiquette n'est retenue que si sa boîte ne
// recouvre ni une étiquette déjà placée, ni un repère, et reste dans la
// zone visible. Sinon elle est masquée : elle réapparaît dès que le zoom
// éloigne suffisamment les repères (les calculs se font en coordonnées
// écran, donc la taille des étiquettes ne grandit pas avec le zoom).

/** Taille de police des étiquettes (unités du viewBox). */
export const LABEL_FONT_SIZE = 11;

/** Rayon d'un repère. */
export const MARKER_RADIUS = 5;

/** Espace entre le bord du repère et l'étiquette. */
export const LABEL_GAP = 3;

/** Marge minimale entre deux boîtes. */
export const LABEL_MARGIN = 1;

const CANDIDATES = [
  'right',
  'left',
  'top',
  'bottom',
  'top-right',
  'top-left',
  'bottom-right',
  'bottom-left',
];

/** Largeur approximative d'un texte (pas de mesure DOM : reste testable). */
export function estimateLabelWidth(text, fontSize = LABEL_FONT_SIZE) {
  return Math.ceil(String(text ?? '').length * fontSize * 0.58) + 2;
}

/** Deux rectangles {x, y, width, height} se recouvrent-ils (marge incluse) ? */
export function boxesOverlap(a, b, margin = 0) {
  return (
    a.x < b.x + b.width + margin &&
    b.x < a.x + a.width + margin &&
    a.y < b.y + b.height + margin &&
    b.y < a.y + a.height + margin
  );
}

function overlapArea(a, b) {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Boîte et ancrage du texte pour une position candidate. */
export function candidateBox(item, candidate, radius = MARKER_RADIUS, gap = LABEL_GAP) {
  const { x, y, width, height } = item;
  const d = radius + gap;
  let horizontal = 'center';
  if (candidate.includes('right')) horizontal = 'right';
  else if (candidate.includes('left')) horizontal = 'left';
  let vertical = 'middle';
  if (candidate.startsWith('top')) vertical = 'top';
  else if (candidate.startsWith('bottom')) vertical = 'bottom';

  let bx = x - width / 2;
  if (horizontal === 'right') bx = x + d;
  if (horizontal === 'left') bx = x - d - width;
  let by = y - height / 2;
  if (vertical === 'top') by = y - d - height;
  if (vertical === 'bottom') by = y + d;

  let textAnchor = 'middle';
  let textX = bx + width / 2;
  if (horizontal === 'right') {
    textAnchor = 'start';
    textX = bx;
  } else if (horizontal === 'left') {
    textAnchor = 'end';
    textX = bx + width;
  }
  return {
    candidate,
    box: { x: bx, y: by, width, height },
    textAnchor,
    textX,
    textY: by + height * 0.75,
  };
}

function insideBounds(box, bounds) {
  return (
    box.x >= 0 &&
    box.y >= 0 &&
    box.x + box.width <= bounds.width &&
    box.y + box.height <= bounds.height
  );
}

/**
 * Calcule le placement de toutes les étiquettes.
 *
 * @param {Array<{id, x, y, width, height, pinned?: boolean}>} items positions
 *   écran des repères (unités du viewBox) et taille de leur étiquette.
 *   `pinned` (lieu sélectionné) : étiquette toujours visible, placée en premier.
 * @param {{width: number, height: number}} bounds zone visible.
 * @returns {Map<id, {visible, candidate, box, textAnchor, textX, textY}>}
 *   Pour une étiquette masquée, la position de repli (utilisée au survol ou
 *   au focus) est tout de même fournie.
 */
export function placeLabels(items, bounds, options = {}) {
  const radius = options.radius ?? MARKER_RADIUS;
  const gap = options.gap ?? LABEL_GAP;
  const margin = options.margin ?? LABEL_MARGIN;
  const markers = items.map((item) => ({
    x: item.x - radius,
    y: item.y - radius,
    width: radius * 2,
    height: radius * 2,
  }));
  // Ordre stable : lieux épinglés d'abord, puis ordre d'entrée.
  const order = items
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        Number(Boolean(b.item.pinned)) - Number(Boolean(a.item.pinned)) || a.index - b.index,
    );

  const placed = [];
  const result = new Map();
  for (const { item } of order) {
    const choices = CANDIDATES.map((candidate) => candidateBox(item, candidate, radius, gap));
    const free = choices.find(
      (choice) =>
        insideBounds(choice.box, bounds) &&
        !markers.some((marker) => boxesOverlap(choice.box, marker, margin)) &&
        !placed.some((box) => boxesOverlap(choice.box, box, margin)),
    );
    if (free) {
      placed.push(free.box);
      result.set(item.id, { visible: true, ...free });
      continue;
    }
    // Repli : la position qui gêne le moins (dans la zone si possible).
    const cost = (choice) =>
      [...placed, ...markers].reduce((sum, box) => sum + overlapArea(choice.box, box), 0) +
      (insideBounds(choice.box, bounds) ? 0 : 1e6);
    const fallback = choices.reduce((best, choice) => (cost(choice) < cost(best) ? choice : best));
    if (item.pinned) placed.push(fallback.box);
    result.set(item.id, { visible: Boolean(item.pinned), ...fallback });
  }
  return result;
}
