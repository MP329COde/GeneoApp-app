// Générateur PDF minimal, local et sans dépendance : texte (polices standard
// Helvetica, encodage WinAnsi), traits, rectangles, images JPEG, signets.
// Les flux de contenu sont compressés avec zlib (module Node natif).
//
// Pourquoi ne pas ajouter une bibliothèque (pdfkit, puppeteer…) ? Le livre ne
// demande que du texte mis en page et une photo ; un écrivain PDF d'environ
// 300 lignes suffit, ne grossit pas l'installateur Electron et fonctionne
// strictement hors ligne. L'impression système (window.print) du client ne
// convient pas : elle n'est ni pilotable ni testable et dépend de l'écran.

import { deflateSync } from 'node:zlib';

export const PAGE = Object.freeze({ width: 595.28, height: 841.89 }); // A4, en points

// Largeurs Helvetica (1/1000 em) des caractères ASCII 32 à 126.
const HELVETICA_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
  611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
  222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

// Caractères hors Latin-1 présents dans la page de code Windows-1252.
const CP1252_EXTRA = new Map([
  ['€', 0x80],
  ['‚', 0x82],
  ['ƒ', 0x83],
  ['„', 0x84],
  ['…', 0x85],
  ['†', 0x86],
  ['‡', 0x87],
  ['ˆ', 0x88],
  ['‰', 0x89],
  ['Š', 0x8a],
  ['‹', 0x8b],
  ['Œ', 0x8c],
  ['Ž', 0x8e],
  ['‘', 0x91],
  ['’', 0x92],
  ['“', 0x93],
  ['”', 0x94],
  ['•', 0x95],
  ['–', 0x96],
  ['—', 0x97],
  ['˜', 0x98],
  ['™', 0x99],
  ['š', 0x9a],
  ['›', 0x9b],
  ['œ', 0x9c],
  ['ž', 0x9e],
  ['Ÿ', 0x9f],
]);

/** Octets Windows-1252 d'un texte ; un caractère inconnu devient « ? ». */
export function encodeWinAnsi(text) {
  const bytes = [];
  for (const char of String(text)) {
    const code = char.codePointAt(0);
    if (code >= 0x20 && code <= 0x7e) bytes.push(code);
    else if (code >= 0xa0 && code <= 0xff) bytes.push(code);
    else if (CP1252_EXTRA.has(char)) bytes.push(CP1252_EXTRA.get(char));
    else if (code === 0x09 || code === 0x202f || code === 0x2009) bytes.push(0x20);
    else bytes.push(0x3f);
  }
  return Buffer.from(bytes);
}

function glyphWidth(char) {
  const code = char.codePointAt(0);
  if (code >= 32 && code <= 126) return HELVETICA_WIDTHS[code - 32];
  if (char === 'œ' || char === 'æ') return 889;
  if (char === 'Œ' || char === 'Æ') return 1000;
  if (char === '’' || char === '‘') return 222;
  if (char === '“' || char === '”') return 333;
  if (char === '–') return 556;
  if (char === '—' || char === '…') return 1000;
  if (char === '•') return 350;
  // Lettre accentuée : même chasse que sa lettre de base.
  const base = char.normalize('NFD')[0];
  if (base !== char && base.codePointAt(0) < 127) return glyphWidth(base);
  return 556;
}

/** Largeur d'un texte, en points, pour la taille donnée (le gras est majoré). */
export function textWidth(text, size, bold = false) {
  let total = 0;
  for (const char of String(text)) total += glyphWidth(char);
  return ((total * size) / 1000) * (bold ? 1.07 : 1);
}

/** Coupe un texte en lignes qui tiennent dans `maxWidth` (retours à la ligne respectés). */
export function wrapText(text, size, maxWidth, bold = false) {
  const lines = [];
  for (const paragraph of String(text).split(/\r?\n/)) {
    if (paragraph.trim() === '') {
      lines.push('');
      continue;
    }
    let current = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word;
      if (textWidth(candidate, size, bold) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      // Mot plus long qu'une ligne : coupé au caractère.
      let rest = word;
      while (textWidth(rest, size, bold) > maxWidth && rest.length > 1) {
        let cut = rest.length - 1;
        while (cut > 1 && textWidth(rest.slice(0, cut), size, bold) > maxWidth) cut -= 1;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      current = rest;
    }
    lines.push(current);
  }
  return lines;
}

/** Dimensions d'un JPEG (marqueur SOF) ; null si le fichier n'est pas un JPEG exploitable. */
export function readJpegInfo(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) return null;
    const marker = buffer[offset + 1];
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    const length = buffer.readUInt16BE(offset + 2);
    const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrame) {
      const components = buffer[offset + 9];
      if (![1, 3].includes(components)) return null; // CMJN non géré
      const height = buffer.readUInt16BE(offset + 5);
      const width = buffer.readUInt16BE(offset + 7);
      return width > 0 && height > 0 ? { height, width, components } : null;
    }
    offset += 2 + length;
  }
  return null;
}

const num = (value) => Number(value.toFixed(2)).toString();
const utf16Hex = (value) => `<FEFF${Buffer.from(value, 'utf16le').swap16().toString('hex')}>`;

export const FONTS = Object.freeze({
  regular: { id: 'F1', name: 'Helvetica' },
  bold: { id: 'F2', name: 'Helvetica-Bold' },
  italic: { id: 'F3', name: 'Helvetica-Oblique' },
});

/** Page en cours de construction : liste d'opérations de dessin. */
export class PdfPage {
  constructor() {
    this.ops = [];
    this.images = [];
    this.bookmarks = [];
  }

  /** Texte dont (x, y) est le début de la ligne de base (origine en bas à gauche). */
  text(x, y, value, { font = 'regular', size = 11, gray = 0 } = {}) {
    if (value === '' || value === null || value === undefined) return;
    const hex = encodeWinAnsi(value).toString('hex');
    this.ops.push(
      `BT /${FONTS[font].id} ${num(size)} Tf ${num(gray)} g ${num(x)} ${num(y)} Td <${hex}> Tj ET`,
    );
  }

  line(x1, y1, x2, y2, { width = 0.5, gray = 0.6 } = {}) {
    this.ops.push(
      `${num(gray)} G ${num(width)} w ${num(x1)} ${num(y1)} m ${num(x2)} ${num(y2)} l S`,
    );
  }

  rect(x, y, width, height, { gray = 0.9 } = {}) {
    this.ops.push(`${num(gray)} g ${num(x)} ${num(y)} ${num(width)} ${num(height)} re f`);
  }

  image(jpeg, x, y, width, height) {
    const name = `Im${this.images.length + 1}`;
    this.images.push({ name, jpeg });
    this.ops.push(`q ${num(width)} 0 0 ${num(height)} ${num(x)} ${num(y)} cm /${name} Do Q`);
  }

  /** Signet pointant sur le haut de cette page (niveau 0 = racine, 1 = enfant). */
  bookmark(title, level = 0) {
    this.bookmarks.push({ title, level });
  }
}

export class PdfDocument {
  constructor({ title = '', author = '', subject = '', creator = 'GeneoApp' } = {}) {
    this.info = { title, author, subject, creator };
    this.pages = [];
  }

  addPage() {
    const page = new PdfPage();
    this.pages.push(page);
    return page;
  }

  /** Assemble le fichier PDF 1.4 complet. */
  toBuffer() {
    const objects = []; // l'objet n° k est à l'index k - 1
    const reserve = () => {
      objects.push(null);
      return objects.length;
    };
    const set = (id, body) => {
      objects[id - 1] = Buffer.isBuffer(body) ? body : Buffer.from(body, 'latin1');
    };
    const stream = (dict, data) =>
      Buffer.concat([
        Buffer.from(`<< ${dict} /Length ${data.length} >>\nstream\n`, 'latin1'),
        data,
        Buffer.from('\nendstream', 'latin1'),
      ]);

    const catalogId = reserve();
    const pagesId = reserve();
    const fontRefs = [];
    for (const font of Object.values(FONTS)) {
      const id = reserve();
      fontRefs.push(`/${font.id} ${id} 0 R`);
      set(
        id,
        `<< /Type /Font /Subtype /Type1 /BaseFont /${font.name} /Encoding /WinAnsiEncoding >>`,
      );
    }

    const pageIds = [];
    const outline = [];
    for (const page of this.pages) {
      const contentId = reserve();
      set(
        contentId,
        stream('/Filter /FlateDecode', deflateSync(Buffer.from(page.ops.join('\n'), 'latin1'))),
      );
      const imageRefs = [];
      for (const image of page.images) {
        const info = readJpegInfo(image.jpeg);
        const id = reserve();
        set(
          id,
          stream(
            `/Type /XObject /Subtype /Image /Width ${info.width} /Height ${info.height} ` +
              `/ColorSpace /${info.components === 1 ? 'DeviceGray' : 'DeviceRGB'} ` +
              '/BitsPerComponent 8 /Filter /DCTDecode',
            image.jpeg,
          ),
        );
        imageRefs.push(`/${image.name} ${id} 0 R`);
      }
      const pageId = reserve();
      pageIds.push(pageId);
      set(
        pageId,
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] ` +
          `/Resources << /Font << ${fontRefs.join(' ')} >>` +
          (imageRefs.length ? ` /XObject << ${imageRefs.join(' ')} >>` : '') +
          ` >> /Contents ${contentId} 0 R >>`,
      );
      for (const bookmark of page.bookmarks) outline.push({ ...bookmark, pageId });
    }
    set(
      pagesId,
      `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`,
    );

    // Signets : les entrées de niveau 1 se rattachent à la dernière de niveau 0.
    let outlineRoot = null;
    if (outline.length > 0) {
      outlineRoot = reserve();
      const ids = outline.map(() => reserve());
      const parents = outline.map(() => outlineRoot);
      let lastTop = null;
      outline.forEach((entry, index) => {
        if (entry.level === 0) lastTop = index;
        else if (lastTop !== null) parents[index] = ids[lastTop];
      });
      const childrenOf = (parentId) => ids.filter((_, index) => parents[index] === parentId);
      const span = (children) =>
        children.length === 0
          ? ''
          : `/First ${children[0]} 0 R /Last ${children.at(-1)} 0 R /Count ${children.length}`;
      set(outlineRoot, `<< /Type /Outlines ${span(childrenOf(outlineRoot))} >>`);
      outline.forEach((entry, index) => {
        const siblings = childrenOf(parents[index]);
        const position = siblings.indexOf(ids[index]);
        set(
          ids[index],
          `<< /Title ${utf16Hex(entry.title)} /Parent ${parents[index]} 0 R ` +
            (position > 0 ? `/Prev ${siblings[position - 1]} 0 R ` : '') +
            (position < siblings.length - 1 ? `/Next ${siblings[position + 1]} 0 R ` : '') +
            `${span(childrenOf(ids[index]))} /Dest [${entry.pageId} 0 R /Fit] >>`,
        );
      });
    }

    const infoId = reserve();
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    set(
      infoId,
      `<< /Title ${utf16Hex(this.info.title)} /Author ${utf16Hex(this.info.author)} ` +
        `/Subject ${utf16Hex(this.info.subject)} /Creator ${utf16Hex(this.info.creator)} ` +
        `/Producer ${utf16Hex('GeneoApp')} /CreationDate (D:${stamp}Z) >>`,
    );
    set(
      catalogId,
      `<< /Type /Catalog /Pages ${pagesId} 0 R` +
        (outlineRoot ? ` /Outlines ${outlineRoot} 0 R /PageMode /UseOutlines` : '') +
        ' >>',
    );

    const header = Buffer.from('%PDF-1.4\n%âãÏÓ\n', 'latin1');
    const chunks = [header];
    const offsets = [];
    let position = header.length;
    objects.forEach((body, index) => {
      offsets.push(position);
      const chunk = Buffer.concat([
        Buffer.from(`${index + 1} 0 obj\n`, 'latin1'),
        body,
        Buffer.from('\nendobj\n', 'latin1'),
      ]);
      chunks.push(chunk);
      position += chunk.length;
    });
    const xref =
      `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
      offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
    chunks.push(
      Buffer.from(
        `${xref}trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\n` +
          `startxref\n${position}\n%%EOF\n`,
        'latin1',
      ),
    );
    return Buffer.concat(chunks);
  }
}
