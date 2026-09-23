import { describe, expect, it } from 'vitest';
import { layoutRadial } from './RadialGraph.jsx';

describe('layoutRadial', () => {
  it('place la racine au centre et chaque degré sur son anneau', () => {
    const network = {
      rootId: 1,
      nodes: [
        { id: 1, distance: 0 },
        { id: 2, distance: 1 },
        { id: 3, distance: 1 },
        { id: 4, distance: 2 },
      ],
      edges: [
        { from: 2, to: 1, kind: 'PARENT' },
        { from: 1, to: 3, kind: 'SPOUSE' },
        { from: 4, to: 2, kind: 'PARENT' },
      ],
    };
    const { positions, maxDistance } = layoutRadial(network);
    expect(positions.get(1)).toEqual({ x: 0, y: 0 });
    const radius = (id) => Math.round(Math.hypot(positions.get(id).x, positions.get(id).y));
    expect(radius(2)).toBe(170);
    expect(radius(3)).toBe(170);
    expect(radius(4)).toBe(340);
    expect(maxDistance).toBe(2);
    // Le grand-parent (4) est aligné sur son enfant (2).
    const angle = (id) => Math.atan2(positions.get(id).y, positions.get(id).x);
    expect(angle(4)).toBeCloseTo(angle(2), 5);
  });
});
