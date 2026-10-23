import { describe, expect, it } from 'vitest';
import {
  GESTURE_THRESHOLD,
  KEYBOARD_PAN_STEP,
  MAX_SCALE,
  MIN_SCALE,
  VIEWBOX_SIZE,
  ZOOM_FACTOR,
  clampScale,
  clampTranslation,
  clientToViewBox,
  createViewport,
  distance,
  panBy,
  toTransform,
  zoomAt,
} from './map-viewport.js';

describe('clampScale', () => {
  it('borne l’échelle entre le minimum et le maximum', () => {
    expect(clampScale(0.2)).toBe(MIN_SCALE);
    expect(clampScale(100)).toBe(MAX_SCALE);
    expect(clampScale(2.5)).toBe(2.5);
  });

  it('rejette les valeurs non finies', () => {
    expect(clampScale(Number.NaN)).toBe(MIN_SCALE);
  });
});

describe('zoomAt', () => {
  it('garde fixe le point d’ancrage', () => {
    const viewport = createViewport();
    const anchor = { x: 120, y: 300 };
    const zoomed = zoomAt(viewport, ZOOM_FACTOR, anchor);
    expect(zoomed.scale).toBeCloseTo(ZOOM_FACTOR);
    // Le contenu sous l’ancre doit rester sous l’ancre.
    const contentX = (anchor.x - viewport.tx) / viewport.scale;
    expect(zoomed.tx + zoomed.scale * contentX).toBeCloseTo(anchor.x);
    const contentY = (anchor.y - viewport.ty) / viewport.scale;
    expect(zoomed.ty + zoomed.scale * contentY).toBeCloseTo(anchor.y);
  });

  it('ne descend jamais sous l’échelle minimale', () => {
    const zoomed = zoomAt({ scale: 1, tx: 0, ty: 0 }, 0.1, { x: 0, y: 0 });
    expect(zoomed.scale).toBe(MIN_SCALE);
  });

  it('ne monte jamais au-delà de l’échelle maximale', () => {
    const zoomed = zoomAt({ scale: MAX_SCALE, tx: 0, ty: 0 }, 4, { x: 0, y: 0 });
    expect(zoomed.scale).toBe(MAX_SCALE);
  });
});

describe('panBy', () => {
  it('déplace la vue de la distance demandée', () => {
    const panned = panBy(createViewport(), 30, -12);
    expect(panned.tx).toBe(30);
    expect(panned.ty).toBe(-12);
  });
});

describe('clampTranslation', () => {
  it('maintient la carte dans la fenêtre', () => {
    const clamped = clampTranslation({ scale: 2, tx: 500, ty: 500 }, VIEWBOX_SIZE);
    expect(clamped.tx).toBe(0);
    expect(clamped.ty).toBe(0);
    const other = clampTranslation({ scale: 2, tx: -5000, ty: -5000 }, VIEWBOX_SIZE);
    expect(other.tx).toBe(VIEWBOX_SIZE - VIEWBOX_SIZE * 2);
    expect(other.ty).toBe(VIEWBOX_SIZE - VIEWBOX_SIZE * 2);
  });

  it('laisse la carte immobile quand elle est entièrement visible', () => {
    const clamped = clampTranslation({ scale: 1, tx: 20, ty: 20 }, VIEWBOX_SIZE);
    expect(clamped.tx).toBe(0);
    expect(clamped.ty).toBe(0);
  });
});

describe('clientToViewBox', () => {
  it('convertit un point écran en unités du viewBox', () => {
    const rect = { left: 10, top: 20, width: VIEWBOX_SIZE, height: VIEWBOX_SIZE };
    expect(clientToViewBox(rect, 10, 20)).toEqual({ x: 0, y: 0 });
    expect(clientToViewBox(rect, 10 + VIEWBOX_SIZE / 2, 20 + VIEWBOX_SIZE / 2)).toEqual({
      x: VIEWBOX_SIZE / 2,
      y: VIEWBOX_SIZE / 2,
    });
  });

  it('tient compte de la taille réelle affichée', () => {
    const rect = { left: 0, top: 0, width: 960, height: 960 };
    const point = clientToViewBox(rect, 480, 480);
    expect(point.x).toBeCloseTo(VIEWBOX_SIZE / 2);
    expect(point.y).toBeCloseTo(VIEWBOX_SIZE / 2);
  });
});

describe('distance', () => {
  it('mesure l’écart entre deux points', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});

describe('toTransform', () => {
  it('produit la transformation SVG de la vue', () => {
    expect(toTransform({ scale: 2, tx: 10, ty: -5 })).toBe('matrix(2 0 0 2 10 -5)');
  });
});

describe('constantes', () => {
  it('expose des seuils utilisables', () => {
    expect(GESTURE_THRESHOLD).toBeGreaterThan(0);
    expect(KEYBOARD_PAN_STEP).toBeGreaterThan(0);
    expect(MIN_SCALE).toBeLessThan(MAX_SCALE);
  });
});
