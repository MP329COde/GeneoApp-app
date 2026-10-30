// Détection du type réel d'un fichier à partir de ses premiers octets
// ("magic bytes"), jamais du type MIME ou de l'extension déclarés par le
// client : un client ne peut pas se faire passer un exécutable pour une
// image en falsifiant le Content-Type ou le nom de fichier.

import { readZip } from '../gedcom/zip.js';

const ascii = (buffer, start, end) => buffer.subarray(start, end).toString('latin1');
const MP4_VIDEO_BRANDS = new Set([
  'isom',
  'iso2',
  'iso4',
  'iso5',
  'iso6',
  'mp41',
  'mp42',
  'avc1',
  'dash',
  'MSNV',
  'M4V ',
  'f4v ',
]);
const M4A_BRANDS = new Set(['M4A ', 'M4B ', 'M4P ']);

const SIGNATURES = [
  {
    mimeType: 'image/jpeg',
    extension: '.jpg',
    test: (buffer) =>
      buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  },
  {
    mimeType: 'image/png',
    extension: '.png',
    test: (buffer) =>
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mimeType: 'image/gif',
    extension: '.gif',
    test: (buffer) =>
      buffer.length >= 6 &&
      (buffer.subarray(0, 6).toString('ascii') === 'GIF87a' ||
        buffer.subarray(0, 6).toString('ascii') === 'GIF89a'),
  },
  {
    mimeType: 'image/webp',
    extension: '.webp',
    test: (buffer) =>
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP',
  },
  {
    mimeType: 'image/tiff',
    extension: '.tiff',
    test: (buffer) =>
      buffer.length >= 4 &&
      (buffer.subarray(0, 4).equals(Buffer.from([0x49, 0x49, 0x2a, 0x00])) ||
        buffer.subarray(0, 4).equals(Buffer.from([0x4d, 0x4d, 0x00, 0x2a]))),
  },
  {
    mimeType: 'application/pdf',
    extension: '.pdf',
    test: (buffer) => buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-',
  },
  // Audio.
  {
    mimeType: 'audio/mpeg',
    extension: '.mp3',
    test: (buffer) =>
      buffer.length >= 4 &&
      (ascii(buffer, 0, 3) === 'ID3' ||
        // Synchronisation de trame MPEG : 11 bits à 1, version et couche valides.
        (buffer[0] === 0xff &&
          (buffer[1] & 0xe0) === 0xe0 &&
          ((buffer[1] >> 3) & 3) !== 1 &&
          ((buffer[1] >> 1) & 3) !== 0)),
  },
  {
    mimeType: 'audio/wav',
    extension: '.wav',
    test: (buffer) =>
      buffer.length >= 12 && ascii(buffer, 0, 4) === 'RIFF' && ascii(buffer, 8, 12) === 'WAVE',
  },
  {
    mimeType: 'audio/ogg',
    extension: '.ogg',
    test: (buffer) => buffer.length >= 4 && ascii(buffer, 0, 4) === 'OggS',
  },
  {
    mimeType: 'audio/flac',
    extension: '.flac',
    test: (buffer) => buffer.length >= 4 && ascii(buffer, 0, 4) === 'fLaC',
  },
  {
    mimeType: 'audio/mp4',
    extension: '.m4a',
    test: (buffer) =>
      buffer.length >= 12 && ascii(buffer, 4, 8) === 'ftyp' && M4A_BRANDS.has(ascii(buffer, 8, 12)),
  },
  // Vidéo.
  {
    mimeType: 'video/mp4',
    extension: '.mp4',
    test: (buffer) =>
      buffer.length >= 12 &&
      ascii(buffer, 4, 8) === 'ftyp' &&
      MP4_VIDEO_BRANDS.has(ascii(buffer, 8, 12)),
  },
  {
    mimeType: 'video/quicktime',
    extension: '.mov',
    test: (buffer) =>
      buffer.length >= 12 && ascii(buffer, 4, 8) === 'ftyp' && ascii(buffer, 8, 12) === 'qt  ',
  },
  {
    mimeType: 'video/webm',
    extension: '.webm',
    test: (buffer) =>
      buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])),
  },
  {
    mimeType: 'video/x-msvideo',
    extension: '.avi',
    test: (buffer) =>
      buffer.length >= 12 && ascii(buffer, 0, 4) === 'RIFF' && ascii(buffer, 8, 12) === 'AVI ',
  },
  // Document Word : une archive ZIP n'est acceptée que si sa structure est celle
  // d'un .docx (partie `word/document.xml`), jamais une archive quelconque.
  {
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extension: '.docx',
    test: (buffer) => {
      if (buffer.length < 4 || ascii(buffer, 0, 4) !== 'PK\x03\x04') return false;
      try {
        const names = readZip(buffer).map((entry) => entry.name);
        return names.includes('[Content_Types].xml') && names.includes('word/document.xml');
      } catch {
        return false;
      }
    },
  },
];

// Texte brut : aucune signature, donc accepté en dernier recours et seulement si
// le contenu est réellement du texte (UTF-8 valide ou UTF-16 avec marque, sans
// octet nul ni caractère de contrôle en quantité).
const TEXT_SIGNATURE = {
  mimeType: 'text/plain',
  extension: '.txt',
  test: (buffer) => {
    if (buffer.length === 0) return false;
    const sample = buffer.subarray(0, 65536);
    let text;
    if (sample.length >= 2 && sample[0] === 0xff && sample[1] === 0xfe) {
      text = new TextDecoder('utf-16le').decode(sample.subarray(2));
    } else if (sample.length >= 2 && sample[0] === 0xfe && sample[1] === 0xff) {
      text = new TextDecoder('utf-16be').decode(sample.subarray(2));
    } else {
      try {
        // Un caractère multi-octets coupé en bout d'échantillon n'est pas une erreur.
        text = new TextDecoder('utf-8', { fatal: true }).decode(
          buffer.length > sample.length ? sample.subarray(0, trimmedLength(sample)) : sample,
        );
      } catch {
        return false;
      }
    }
    let controls = 0;
    for (const char of text) {
      const code = char.charCodeAt(0);
      if (code === 0 || code === 0xfffd) return false;
      if (code < 32 && code !== 9 && code !== 10 && code !== 13) controls += 1;
    }
    return controls / Math.max(1, text.length) < 0.01;
  },
};

// Longueur utile d'un échantillon UTF-8 coupé au milieu d'un caractère.
function trimmedLength(sample) {
  let end = sample.length;
  let back = 0;
  while (end > 0 && back < 4 && (sample[end - 1] & 0xc0) === 0x80) {
    end -= 1;
    back += 1;
  }
  if (end > 0 && sample[end - 1] >= 0xc0) end -= 1;
  return end;
}

/** Catégorie d'un type MIME détecté, pour appliquer une limite de taille adaptée. */
export function categoryOf(mimeType) {
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  return 'document';
}

/**
 * Renvoie { mimeType, extension } pour le premier type reconnu, ou null si
 * le contenu ne correspond à aucun type accepté par l'application.
 */
export function sniffMimeType(buffer) {
  // Une marque UTF-16 (FF FE / FE FF) ressemble à une synchronisation de trame
  // MPEG : si le contenu est réellement du texte, c'est du texte.
  const utf16Mark =
    buffer.length >= 2 &&
    ((buffer[0] === 0xff && buffer[1] === 0xfe) || (buffer[0] === 0xfe && buffer[1] === 0xff));
  if (utf16Mark && TEXT_SIGNATURE.test(buffer)) {
    return {
      mimeType: TEXT_SIGNATURE.mimeType,
      extension: TEXT_SIGNATURE.extension,
      category: 'document',
    };
  }
  const signature =
    SIGNATURES.find(({ test }) => test(buffer)) ??
    (TEXT_SIGNATURE.test(buffer) ? TEXT_SIGNATURE : null);
  return signature
    ? {
        mimeType: signature.mimeType,
        extension: signature.extension,
        category: categoryOf(signature.mimeType),
      }
    : null;
}

export function acceptedMimeTypes() {
  return [...SIGNATURES, TEXT_SIGNATURE].map((signature) => signature.mimeType);
}
