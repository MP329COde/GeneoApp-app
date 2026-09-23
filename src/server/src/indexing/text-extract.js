import path from 'node:path';

// Extraction de texte pour l'index plein texte. Aucune exécution de contenu :
// le HTML est réduit à son texte (scripts, styles et commentaires retirés).

export const MAX_INDEXED_CHARS = 200_000;
const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.csv', '.json', '.ged', '.xml']);
const HTML_EXTENSIONS = new Set(['.html', '.htm']);
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

/** Texte, titre et liens d'une page HTML. */
export function htmlToText(html) {
  const source = String(html);
  const title =
    decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(source)?.[1] ?? '')
      .replace(/\s+/g, ' ')
      .trim() ||
    decodeEntities(/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(source)?.[1]?.replace(/<[^>]+>/g, '') ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  const links = [...source.matchAll(/<a\b[^>]*\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi)].map(
    (match) => decodeEntities(match[2] ?? match[3] ?? match[4] ?? ''),
  );
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
  return { title, text, links };
}

export function kindOf(filename, mimeType = '') {
  const extension = path.extname(filename).toLowerCase();
  if (mimeType.startsWith('text/html') || HTML_EXTENSIONS.has(extension)) return 'html';
  if (
    mimeType.startsWith('application/pdf') ||
    mimeType.startsWith('image/') ||
    OCR_EXTENSIONS.has(extension)
  ) {
    return 'ocr';
  }
  if (mimeType.startsWith('text/') || TEXT_EXTENSIONS.has(extension)) return 'text';
  return null;
}

/**
 * Extrait le texte indexable. `ocr(filePath)` est facultatif (tesseract local) :
 * sans lui, un PDF ou une image est indexé par son titre uniquement.
 */
export async function extractText({
  buffer,
  filename,
  mimeType = '',
  filePath = null,
  ocr = null,
}) {
  const kind = kindOf(filename, mimeType);
  const fallbackTitle = path.basename(filename);
  if (kind === 'text') {
    return {
      title: fallbackTitle,
      text: buffer.toString('utf8').slice(0, MAX_INDEXED_CHARS),
      status: 'EXTRACTED',
      links: [],
    };
  }
  if (kind === 'html') {
    const { title, text, links } = htmlToText(buffer.toString('utf8'));
    return {
      title: title || fallbackTitle,
      text: text.slice(0, MAX_INDEXED_CHARS),
      status: 'EXTRACTED',
      links,
    };
  }
  if (kind === 'ocr' && ocr && filePath) {
    try {
      const text = (await ocr(filePath)) ?? '';
      if (text.trim()) {
        return {
          title: fallbackTitle,
          text: text.slice(0, MAX_INDEXED_CHARS),
          status: 'OCR',
          links: [],
        };
      }
    } catch {
      // OCR indisponible ou en échec : indexation par le titre seulement.
    }
  }
  return { title: fallbackTitle, text: '', status: 'UNAVAILABLE', links: [] };
}
