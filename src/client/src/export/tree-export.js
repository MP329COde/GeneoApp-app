// Export de l'arbre affiché : SVG vectoriel autonome (couleurs résolues depuis
// les tokens du thème courant), PNG rasterisé et découpage en pages pour
// l'impression géante. Tout est calculé localement, sans aucun service.

const SVG_NS = 'http://www.w3.org/2000/svg';
const PADDING = 24;

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function token(name, fallback) {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function palette() {
  return {
    background: token('--bg-app', '#f4f1ea'),
    surface: token('--surface-raised', '#ffffff'),
    selected: token('--surface-selected', '#dde8f5'),
    border: token('--border', '#cfc7b8'),
    action: token('--action', '#1a5b9e'),
    text: token('--text', '#1c2124'),
    secondary: token('--text-secondary', '#555049'),
    line: token('--rel-biological', '#2c3a42'),
    paternal: token('--branch-paternal', '#2f5e8c'),
    maternal: token('--branch-maternal', '#8a5a2b'),
  };
}

function relativeRect(element, origin, scale) {
  const rect = element.getBoundingClientRect();
  return {
    x: (rect.left - origin.left) / scale,
    y: (rect.top - origin.top) / scale,
    width: rect.width / scale,
    height: rect.height / scale,
  };
}

function nodeLines(element) {
  const name = element.querySelector('.person-card__name')?.textContent?.trim() ?? '';
  const meta = [...element.querySelectorAll('.tree-node__meta > *, .person-card__years')]
    .map((part) => part.textContent.trim())
    .filter(Boolean)
    .join(' · ');
  return { name, meta };
}

/**
 * Construit un SVG autonome à partir de l'arbre rendu dans `stage`.
 * Gère l'éventail (déjà en SVG), les arbres ascendant/descendant (nœuds +
 * connecteurs coudés) et la vue familiale (cartes).
 */
export function buildTreeSvg(stage, { title } = {}) {
  if (!stage) throw new Error('Aucun arbre à exporter');
  const colors = palette();

  const fan = stage.querySelector('svg.fan-chart');
  if (fan) {
    const clone = fan.cloneNode(true);
    clone.setAttribute('xmlns', SVG_NS);
    clone.removeAttribute('width');
    clone.querySelectorAll('[role], [tabindex]').forEach((node) => {
      node.removeAttribute('role');
      node.removeAttribute('tabindex');
    });
    // Couleurs écrites en attributs (pas de <style>) : le SVG reste valable
    // tel quel sous la CSP stricte de l'application et dans tout lecteur.
    for (const cell of clone.querySelectorAll('.fan-chart__cell')) {
      const root = cell.classList.contains('fan-chart__cell--root');
      const stroke = root
        ? colors.action
        : cell.classList.contains('fan-chart__cell--maternal')
          ? colors.maternal
          : cell.classList.contains('fan-chart__cell--paternal')
            ? colors.paternal
            : colors.border;
      cell.setAttribute('fill', root ? colors.selected : colors.surface);
      cell.setAttribute('stroke', stroke);
      cell.setAttribute('stroke-width', root ? '2' : '1');
    }
    for (const text of clone.querySelectorAll('.fan-chart__text')) {
      text.setAttribute('fill', colors.text);
      text.setAttribute('font-family', 'Newsreader, Georgia, serif');
      text.setAttribute('font-weight', '600');
    }
    return new XMLSerializer().serializeToString(clone);
  }

  const origin = stage.getBoundingClientRect();
  const scale = stage.offsetWidth ? origin.width / stage.offsetWidth || 1 : 1;
  const nodes = [...stage.querySelectorAll('.tree-node, .person-card')];
  if (nodes.length === 0) throw new Error('Aucun arbre à exporter');

  const boxes = new Map(nodes.map((node) => [node, relativeRect(node, origin, scale)]));
  const width = Math.max(...[...boxes.values()].map((box) => box.x + box.width)) + PADDING;
  const height = Math.max(...[...boxes.values()].map((box) => box.y + box.height)) + PADDING;

  const parts = [];
  // Connecteurs coudés entre chaque nœud et ses parents / enfants affichés.
  for (const branch of stage.querySelectorAll('.tree-branch')) {
    const from = branch.querySelector(':scope > .tree-node');
    if (!from) continue;
    const a = boxes.get(from);
    const children = branch.querySelectorAll(
      ':scope > .tree-branch__children > .tree-branch > .tree-node',
    );
    for (const child of children) {
      const b = boxes.get(child);
      const x1 = a.x + a.width;
      const y1 = a.y + a.height / 2;
      const x2 = b.x;
      const y2 = b.y + b.height / 2;
      const mid = (x1 + x2) / 2;
      parts.push(
        `<path d="M${x1} ${y1} H${mid} V${y2} H${x2}" fill="none" stroke="${colors.line}" stroke-width="2"/>`,
      );
    }
  }
  for (const connector of stage.querySelectorAll('.tree-connector')) {
    const box = relativeRect(connector, origin, scale);
    parts.push(
      `<rect x="${box.x}" y="${box.y}" width="${Math.max(box.width, 2)}" height="${box.height}" fill="${colors.line}"/>`,
    );
  }
  for (const [node, box] of boxes) {
    const focus =
      node.classList.contains('tree-node--focus') ||
      node.classList.contains('person-card--selected');
    const branch = node.classList.contains('tree-node--maternal')
      ? colors.maternal
      : node.classList.contains('tree-node--paternal')
        ? colors.paternal
        : colors.border;
    const { name, meta } = nodeLines(node);
    parts.push(
      `<g><rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="6"
        fill="${focus ? colors.selected : colors.surface}" stroke="${focus ? colors.action : colors.border}"
        stroke-width="${focus ? 2 : 1}"/>
      <rect x="${box.x}" y="${box.y}" width="3" height="${box.height}" fill="${focus ? colors.action : branch}"/>
      <text x="${box.x + 12}" y="${box.y + 24}" font-family="Newsreader, Georgia, serif" font-weight="600"
        font-size="16" fill="${colors.text}">${escapeXml(name)}</text>
      ${
        meta
          ? `<text x="${box.x + 12}" y="${box.y + 44}" font-family="IBM Plex Mono, Menlo, monospace"
        font-size="12" fill="${colors.secondary}">${escapeXml(meta)}</text>`
          : ''
      }</g>`,
    );
  }

  const heading = title ? `<title>${escapeXml(title)}</title>` : '';
  return `<svg xmlns="${SVG_NS}" viewBox="0 0 ${Math.ceil(width)} ${Math.ceil(height)}" width="${Math.ceil(width)}" height="${Math.ceil(height)}">${heading}<rect width="100%" height="100%" fill="${colors.background}"/>${parts.join('')}</svg>`;
}

export function svgDimensions(svg) {
  const match = svg.match(/viewBox="([\d.\s-]+)"/);
  if (!match) return { width: 800, height: 600 };
  const [, , width, height] = match[1].trim().split(/\s+/).map(Number);
  return { width, height };
}

export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadSvg(filename, svg) {
  downloadBlob(filename, new Blob([svg], { type: 'image/svg+xml' }));
}

/** Rasterise le SVG en PNG (résolution ×2 pour l'impression). */
export function svgToPngBlob(svg, { scale = 2 } = {}) {
  const { width, height } = svgDimensions(svg);
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(width * scale);
      canvas.height = Math.ceil(height * scale);
      const context = canvas.getContext('2d');
      context.scale(scale, scale);
      context.drawImage(image, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Export PNG impossible'))));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Export PNG impossible'));
    };
    image.src = url;
  });
}

// Formats de page en millimètres (paysage) pour l'impression géante.
export const PAGE_SIZES = {
  A4: { width: 297, height: 210 },
  A3: { width: 420, height: 297 },
};
const MM_TO_PX = 96 / 25.4;
const PRINT_MARGIN_MM = 10;
const OVERLAP_MM = 8;

/**
 * Découpe un SVG en tuiles de page, avec un léger recouvrement pour le
 * collage. `pagesWide` fixe le nombre de pages en largeur ; la hauteur suit.
 */
export function tileSvg(svg, { pageSize = 'A4', pagesWide = 2 } = {}) {
  const { width, height } = svgDimensions(svg);
  const page = PAGE_SIZES[pageSize] ?? PAGE_SIZES.A4;
  const printable = {
    width: (page.width - 2 * PRINT_MARGIN_MM) * MM_TO_PX,
    height: (page.height - 2 * PRINT_MARGIN_MM) * MM_TO_PX,
  };
  const overlap = OVERLAP_MM * MM_TO_PX;
  const zoom = (pagesWide * printable.width - (pagesWide - 1) * overlap) / width;
  const tileWidth = printable.width / zoom;
  const tileHeight = printable.height / zoom;
  const step = { x: tileWidth - overlap / zoom, y: tileHeight - overlap / zoom };
  const rows = Math.max(1, Math.ceil((height - overlap / zoom) / step.y));
  const inner = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  const tiles = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < pagesWide; column += 1) {
      const x = column * step.x;
      const y = row * step.y;
      tiles.push({
        row: row + 1,
        column: column + 1,
        svg: `<svg xmlns="${SVG_NS}" viewBox="${x} ${y} ${tileWidth} ${tileHeight}" preserveAspectRatio="xMinYMin meet">${inner}</svg>`,
      });
    }
  }
  return { tiles, rows, columns: pagesWide, page };
}
