import { describe, expect, it } from 'vitest';
import { buildTreeSvg, svgDimensions, tileSvg } from './tree-export.js';

function stageWith(html) {
  const stage = document.createElement('div');
  stage.innerHTML = html;
  document.body.append(stage);
  let offset = 0;
  // jsdom ne calcule pas de mise en page : positions factices déterministes.
  for (const node of stage.querySelectorAll('.tree-node')) {
    const x = offset;
    offset += 240;
    node.getBoundingClientRect = () => ({ left: x, top: 20, width: 200, height: 64 });
  }
  stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 200 });
  return stage;
}

describe('buildTreeSvg', () => {
  it('produit un SVG autonome avec nœuds, connecteurs et textes échappés', () => {
    const stage = stageWith(`
      <div class="tree-branch">
        <button class="tree-node tree-node--focus"><span class="person-card__name">Jean &lt;Dupont&gt;</span>
          <span class="tree-node__meta"><span>Sosa 1</span></span></button>
        <div class="tree-branch__children">
          <div class="tree-branch"><button class="tree-node tree-node--paternal">
            <span class="person-card__name">Pierre</span></button></div>
          <div class="tree-branch"><button class="tree-node tree-node--maternal">
            <span class="person-card__name">Anne</span></button></div>
        </div>
      </div>`);
    const svg = buildTreeSvg(stage, { title: 'Arbre de Jean' });

    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain('<title>Arbre de Jean</title>');
    expect(svg).toContain('Jean &lt;Dupont&gt;');
    expect(svg).not.toContain('<Dupont>');
    expect(svg.match(/<path /g)).toHaveLength(2);
    expect(svg).toContain('Sosa 1');
    expect(svgDimensions(svg)).toEqual({ width: 704, height: 108 });
    const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
    expect(parsed.querySelector('parsererror')).toBeNull();
  });

  it('refuse d’exporter un arbre vide', () => {
    expect(() => buildTreeSvg(stageWith('<p>vide</p>'))).toThrow('Aucun arbre à exporter');
    expect(() => buildTreeSvg(null)).toThrow('Aucun arbre à exporter');
  });
});

describe('tileSvg', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3000 1500"><rect/></svg>';

  it('découpe en pages selon le nombre de pages en largeur', () => {
    const one = tileSvg(svg, { pagesWide: 1 });
    const three = tileSvg(svg, { pagesWide: 3 });
    expect(one.tiles).toHaveLength(one.rows);
    expect(three.columns).toBe(3);
    expect(three.tiles).toHaveLength(3 * three.rows);
    expect(three.rows).toBeGreaterThan(one.rows);
    expect(three.tiles[0].svg).toContain('<rect/>');
    expect(three.tiles[0].svg).toMatch(/viewBox="0 0 /);
  });

  it('A3 demande moins de lignes que A4 pour la même largeur', () => {
    expect(tileSvg(svg, { pageSize: 'A3', pagesWide: 2 }).rows).toBeLessThanOrEqual(
      tileSvg(svg, { pageSize: 'A4', pagesWide: 2 }).rows,
    );
  });
});
