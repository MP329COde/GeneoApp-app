import { describe, expect, it } from 'vitest';
import { MARKER_RADIUS, boxesOverlap, estimateLabelWidth, placeLabels } from './map-labels.js';
import { VIEWBOX_SIZE, zoomAt } from './map-viewport.js';

const bounds = { width: VIEWBOX_SIZE, height: VIEWBOX_SIZE };
const make = (id, x, y, extra = {}) => ({
  id,
  x,
  y,
  width: estimateLabelWidth(id),
  height: 14,
  ...extra,
});
const visibleBoxes = (result) =>
  [...result.values()].filter((entry) => entry.visible).map((entry) => entry.box);

function expectNoOverlap(items, result) {
  const boxes = visibleBoxes(result);
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      expect(boxesOverlap(boxes[i], boxes[j])).toBe(false);
    }
    for (const item of items) {
      const marker = {
        x: item.x - MARKER_RADIUS,
        y: item.y - MARKER_RADIUS,
        width: MARKER_RADIUS * 2,
        height: MARKER_RADIUS * 2,
      };
      expect(boxesOverlap(boxes[i], marker)).toBe(false);
    }
  }
}

describe('placeLabels', () => {
  it('place à droite une étiquette isolée', () => {
    const result = placeLabels([make('Paris', 200, 200)], bounds);
    expect(result.get('Paris')).toMatchObject({
      visible: true,
      candidate: 'right',
      textAnchor: 'start',
    });
  });

  it('ne recouvre aucune boîte pour des lieux proches (Amiens/Rouen/Paris)', () => {
    const items = [make('Amiens', 200, 150), make('Rouen', 190, 162), make('Paris', 205, 168)];
    const result = placeLabels(items, bounds);
    expectNoOverlap(items, result);
    expect([...result.values()].some((entry) => entry.visible)).toBe(true);
  });

  it('masque les étiquettes en conflit puis les fait apparaître au zoom', () => {
    const items = Array.from({ length: 8 }, (_, index) =>
      make(`Lieu-${index}`, 100 + (index % 4) * 4, 300 + Math.floor(index / 4) * 4),
    );
    const low = placeLabels(items, bounds);
    expectNoOverlap(items, low);
    const hiddenLow = [...low.values()].filter((entry) => !entry.visible).length;
    expect(hiddenLow).toBeGreaterThan(0);

    const viewport = zoomAt({ scale: 1, tx: 0, ty: 0 }, 8, { x: 100, y: 300 });
    const zoomed = items.map((item) => ({
      ...item,
      x: item.x * viewport.scale + viewport.tx,
      y: item.y * viewport.scale + viewport.ty,
    }));
    const high = placeLabels(zoomed, bounds);
    expectNoOverlap(zoomed, high);
    const hiddenHigh = [...high.values()].filter((entry) => !entry.visible).length;
    expect(hiddenHigh).toBeLessThan(hiddenLow);
  });

  it('garde visible l’étiquette épinglée (sélection) et la place en premier', () => {
    const items = Array.from({ length: 12 }, (_, index) =>
      make(`Lieu-${index}`, 100 + (index % 3), 100, { pinned: index === 11 }),
    );
    const result = placeLabels(items, bounds);
    expect(result.get('Lieu-11').visible).toBe(true);
    expect(result.get('Lieu-11').candidate).toBe('right');
    expect([...result.values()].some((entry) => !entry.visible)).toBe(true);
  });

  it('fournit une position de repli pour une étiquette masquée', () => {
    const items = [make('A', 50, 50), make('B', 50, 50), make('C', 50, 50), make('D', 50, 50)];
    const result = placeLabels(items, bounds);
    for (const entry of result.values()) {
      expect(entry.box.width).toBeGreaterThan(0);
      expect(Number.isFinite(entry.textX)).toBe(true);
    }
  });

  it('reste dans la zone visible près d’un bord', () => {
    const entry = placeLabels([make('Brest', 470, 5)], bounds).get('Brest');
    expect(entry.visible).toBe(true);
    expect(entry.box.x).toBeGreaterThanOrEqual(0);
    expect(entry.box.x + entry.box.width).toBeLessThanOrEqual(bounds.width);
    expect(entry.box.y).toBeGreaterThanOrEqual(0);
  });

  it('est déterministe', () => {
    const items = [make('a', 10, 10), make('b', 12, 12), make('c', 14, 9)];
    expect([...placeLabels(items, bounds)]).toEqual([...placeLabels(items, bounds)]);
  });
});
