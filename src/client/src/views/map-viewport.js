// Logique de viewport (zoom / déplacement) de la carte hors ligne.
//
// La carte est un SVG unique (viewBox carré) : la vue est décrite par une
// transformation affine « translate(tx, ty) scale(s) » appliquée au groupe
// contenant le fond de carte et les repères. Un point de contenu (x, y)
// apparaît alors à l'écran en (s * x + tx, s * y + ty).
//
// Ce module ne contient que des fonctions pures : il est testable sans DOM
// et réutilisable par la souris, le tactile et le clavier.

/** Taille du viewBox SVG de la carte locale (carré, en unités utilisateur). */
export const VIEWBOX_SIZE = 480;

/** Zoom minimal : la carte entière tient dans la fenêtre. */
export const MIN_SCALE = 1;

/** Zoom maximal : au-delà, les repères deviennent illisibles. */
export const MAX_SCALE = 8;

/** Facteur appliqué par un cran de zoom (boutons, molette, clavier). */
export const ZOOM_FACTOR = 1.4;

/** Distance de déplacement au clavier, en unités du viewBox. */
export const KEYBOARD_PAN_STEP = 48;

/** Nombre minimal de repères (zoom) ou d'unités (déplacement) pour un geste. */
export const GESTURE_THRESHOLD = 4;

/** Vue initiale : carte entière, aucun déplacement. */
export function createViewport() {
  return { scale: 1, tx: 0, ty: 0 };
}

/** Borne l'échelle entre MIN_SCALE et MAX_SCALE. */
export function clampScale(scale) {
  if (!Number.isFinite(scale)) return MIN_SCALE;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/**
 * Convertit un point écran (clientX/clientY) en unités du viewBox.
 * `rect` est le rectangle client du SVG (getBoundingClientRect).
 * Le viewBox est carré et rendu en `preserveAspectRatio="xMidYMid meet"` :
 * la zone visible est centrée, comme le fait le navigateur.
 */
export function clientToViewBox(rect, clientX, clientY, size = VIEWBOX_SIZE) {
  const width = rect?.width || size;
  const height = rect?.height || size;
  const scale = Math.min(width, height) / size;
  const offsetX = (width - size * scale) / 2;
  const offsetY = (height - size * scale) / 2;
  return {
    x: (clientX - (rect?.left ?? 0) - offsetX) / scale,
    y: (clientY - (rect?.top ?? 0) - offsetY) / scale,
  };
}

/**
 * Zoom en gardant fixe le point `point` (en unités du viewBox) : le contenu
 * sous le curseur ou le doigt ne bouge pas.
 */
export function zoomAt(viewport, factor, point) {
  const scale = clampScale(viewport.scale * factor);
  const contentX = (point.x - viewport.tx) / viewport.scale;
  const contentY = (point.y - viewport.ty) / viewport.scale;
  return {
    scale,
    tx: point.x - scale * contentX,
    ty: point.y - scale * contentY,
  };
}

/** Déplace la vue de (dx, dy) unités du viewBox (sens : contenu vers la droite). */
export function panBy(viewport, dx, dy) {
  return { ...viewport, tx: viewport.tx + dx, ty: viewport.ty + dy };
}

/**
 * Empêche de faire sortir la carte de la fenêtre : la zone visible reste
 * dans les limites de la carte zoomée.
 */
export function clampTranslation(viewport, size = VIEWBOX_SIZE) {
  const span = size * viewport.scale;
  const min = size - span;
  return {
    ...viewport,
    tx: Math.min(Math.max(viewport.tx, min), 0),
    ty: Math.min(Math.max(viewport.ty, min), 0),
  };
}

/** Distance entre deux points (utilisée pour le pincement tactile). */
export function distance(first, second) {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

/**
 * Transformation SVG correspondant à la vue.
 *
 * Une matrice explicite est utilisée plutôt que `translate(...) scale(...)` :
 * en SVG, l'attribut `transform` dépend de `transform-origin`, ce qui rend
 * l'origine du repère ambiguë. La matrice, elle, est absolue : un point de
 * contenu (x, y) apparaît exactement en (scale * x + tx, scale * y + ty).
 */
export function toTransform(viewport) {
  const { scale, tx, ty } = viewport;
  return `matrix(${scale} 0 0 ${scale} ${tx} ${ty})`;
}
