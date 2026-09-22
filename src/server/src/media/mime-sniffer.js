// Détection du type réel d'un fichier à partir de ses premiers octets
// ("magic bytes"), jamais du type MIME ou de l'extension déclarés par le
// client : un client ne peut pas se faire passer un exécutable pour une
// image en falsifiant le Content-Type ou le nom de fichier.

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
];

/**
 * Renvoie { mimeType, extension } pour le premier type reconnu, ou null si
 * le contenu ne correspond à aucun type accepté par l'application.
 */
export function sniffMimeType(buffer) {
  const signature = SIGNATURES.find(({ test }) => test(buffer));
  return signature ? { mimeType: signature.mimeType, extension: signature.extension } : null;
}

export function acceptedMimeTypes() {
  return SIGNATURES.map((signature) => signature.mimeType);
}
