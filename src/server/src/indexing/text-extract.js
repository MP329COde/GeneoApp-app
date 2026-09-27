import path from 'node:path';
import { ocrImage, officeText, pdfContent } from './content-extract.js';

// Extraction de texte pour l'index plein texte. Aucune exécution de contenu :
// le HTML est réduit à son texte (scripts, styles et commentaires retirés).

export const MAX_INDEXED_CHARS = 200_000;
const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.csv', '.json', '.ged', '.xml']);
const HTML_EXTENSIONS = new Set(['.html', '.htm']);
export const OFFICE_EXTENSIONS = new Set(['.docx', '.xlsx', '.pptx', '.odt', '.ods', '.odp']);
export const OCR_EXTENSIONS = new Set([
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.tif',
  '.tiff',
  '.webp',
  '.gif',
]);
export const SUPPORTED_EXTENSIONS = new Set([
  ...TEXT_EXTENSIONS,
  ...HTML_EXTENSIONS,
  ...OCR_EXTENSIONS,
  ...OFFICE_EXTENSIONS,
]);

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === '#') {
      const code =
        entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return Number.isFinite(code) && code > 0 && code < 0x110000
        ? String.fromCodePoint(code)
        : match;
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
}

const CHARSET_ALIASES = { 'iso-8859-1': 'windows-1252', latin1: 'windows-1252', ascii: 'utf-8' };

function decoderFor(label) {
  const name = String(label ?? '')
    .trim()
    .toLowerCase()
    .replace(/^["']|["']$/g, '');
  try {
    return name ? new TextDecoder(CHARSET_ALIASES[name] ?? name) : null;
  } catch {
    return null;
  }
}

/**
 * Décode un contenu textuel selon son jeu de caractères : BOM, en-tête
 * Content-Type, balise <meta charset>, puis UTF-8 s'il est valide, sinon
 * windows-1252 (fréquent sur les anciens sites d'archives).
 */
export function decodeText(buffer, contentType = '') {
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3).toString('utf8');
  }
  if (buffer[0] === 0xff && buffer[1] === 0xfe) return new TextDecoder('utf-16le').decode(buffer);
  if (buffer[0] === 0xfe && buffer[1] === 0xff) return new TextDecoder('utf-16be').decode(buffer);
  const head = buffer.subarray(0, 2048).toString('latin1');
  const declared =
    /charset\s*=\s*([\w-]+)/i.exec(contentType)?.[1] ??
    /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(head)?.[1] ??
    /<\?xml[^>]+encoding\s*=\s*["']([\w-]+)/i.exec(head)?.[1];
  const decoder = decoderFor(declared);
  if (decoder && !/^utf-?8$/i.test(declared)) return decoder.decode(buffer);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

function attribute(tag, name) {
  const match = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  return match ? decodeEntities(match[2] ?? match[3] ?? match[4] ?? '') : null;
}

/**
 * Texte, titre et liens d'une page HTML, avec les directives d'indexation :
 * <meta name="robots"> (noindex, nofollow), liens rel="nofollow" écartés,
 * adresse canonique.
 */
export function htmlToText(html) {
  const source = String(html);
  const robotsMeta = [...source.matchAll(/<meta\b[^>]*>/gi)]
    .map(([tag]) => tag)
    .filter((tag) => /^(robots|geneoapp-indexer)$/i.test(attribute(tag, 'name') ?? ''))
    .map((tag) => (attribute(tag, 'content') ?? '').toLowerCase())
    .join(',');
  const canonicalTag = [...source.matchAll(/<link\b[^>]*>/gi)]
    .map(([tag]) => tag)
    .find((tag) => /(^|\s)canonical(\s|$)/i.test(attribute(tag, 'rel') ?? ''));
  const title =
    decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(source)?.[1] ?? '')
      .replace(/\s+/g, ' ')
      .trim() ||
    decodeEntities(/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(source)?.[1]?.replace(/<[^>]+>/g, '') ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  const nofollow = /\b(nofollow|none)\b/.test(robotsMeta);
  const links = nofollow
    ? []
    : [...source.matchAll(/<a\b[^>]*>/gi)]
        .map(([tag]) => tag)
        .filter((tag) => !/\bnofollow\b/i.test(attribute(tag, 'rel') ?? ''))
        .map((tag) => attribute(tag, 'href'))
        .filter((href) => href && !/^(javascript|mailto|tel|data):/i.test(href.trim()));
  const text = decodeEntities(
    source
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
  return {
    title,
    text,
    links,
    noindex: /\b(noindex|none)\b/.test(robotsMeta),
    canonical: canonicalTag ? attribute(canonicalTag, 'href') : null,
  };
}

export function kindOf(filename, mimeType = '') {
  const extension = path.extname(filename).toLowerCase();
  if (mimeType.startsWith('text/html') || HTML_EXTENSIONS.has(extension)) return 'html';
  if (mimeType.startsWith('application/pdf') || extension === '.pdf') return 'pdf';
  if (OFFICE_EXTENSIONS.has(extension)) return 'office';
  if (mimeType.startsWith('image/') || OCR_EXTENSIONS.has(extension)) return 'image';
  if (mimeType.startsWith('text/') || TEXT_EXTENSIONS.has(extension)) return 'text';
  return null;
}

/**
 * Extrait le contenu indexable : texte, HTML, PDF (texte ou pages scannées),
 * images (OCR) et documents bureautiques. `ocr(buffer)` est remplaçable
 * (tests) ; par défaut, OCR local embarqué.
 */
export async function extractText({ buffer, filename, mimeType = '', ocr = ocrImage }) {
  const kind = kindOf(filename, mimeType);
  const fallbackTitle = path.basename(filename);
  const done = (text, status, extra = {}) => ({
    title: fallbackTitle,
    text: (text ?? '').slice(0, MAX_INDEXED_CHARS),
    status: text && text.trim() ? status : 'UNAVAILABLE',
    links: [],
    ...extra,
  });
  try {
    if (kind === 'text') return done(decodeText(buffer, mimeType), 'EXTRACTED');
    if (kind === 'html') {
      const { title, text, links, noindex, canonical } = htmlToText(decodeText(buffer, mimeType));
      return done(text, 'EXTRACTED', { title: title || fallbackTitle, links, noindex, canonical });
    }
    if (kind === 'office') return done(officeText(buffer), 'EXTRACTED');
    if (kind === 'pdf') {
      const { text, status } = await pdfContent(buffer, { ocr });
      return done(text, status);
    }
    if (kind === 'image') return done(await ocr(buffer), 'OCR');
  } catch {
    // Contenu illisible : le document reste trouvable par son nom.
  }
  return done('', 'UNAVAILABLE');
}
