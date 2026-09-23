import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { PayloadTooLargeError, ValidationError } from '../errors.js';

// ZIP minimal (méthodes 0 « stored » et 8 « deflate ») pour le format GEDZIP
// de GEDCOM 7 : aucune dépendance externe, limites strictes à la lecture.

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL = 0x06054b50;

export const ZIP_LIMITS = Object.freeze({
  maxEntries: 5_000,
  maxEntryBytes: 50 * 1024 * 1024,
  maxTotalBytes: 500 * 1024 * 1024,
  maxCompressionRatio: 200,
});

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Chemin d'entrée sûr : relatif, sans « .. », sans lettre de lecteur ni
 * antislash. Toute autre forme est refusée (protection path traversal).
 */
export function assertSafeEntryName(name) {
  if (
    typeof name !== 'string' ||
    name === '' ||
    name.length > 255 ||
    name.startsWith('/') ||
    name.includes('\\') ||
    /^[a-zA-Z]:/.test(name) ||
    name.split('/').some((part) => part === '..' || part === '.') ||
    // eslint-disable-next-line no-control-regex
    /[\u0000-\u001f]/.test(name)
  ) {
    throw new ValidationError(`Nom d’entrée ZIP refusé : ${String(name).slice(0, 80)}`);
  }
  return name;
}

/** Construit une archive ZIP à partir de `[{ name, content: Buffer }]`. */
export function createZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, content } of entries) {
    assertSafeEntryName(name);
    const nameBuffer = Buffer.from(name, 'utf8');
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const compressed = deflateRawSync(data);
    const useDeflate = compressed.length < data.length;
    const payload = useDeflate ? compressed : data;
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_HEADER, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8
    local.writeUInt16LE(useDeflate ? 8 : 0, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    locals.push(local, nameBuffer, payload);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL_HEADER, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(useDeflate ? 8 : 0, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuffer);

    offset += local.length + nameBuffer.length + payload.length;
  }
  const centralBuffer = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(END_OF_CENTRAL, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuffer, end]);
}

/**
 * Lit une archive ZIP en mémoire avec des limites strictes (nombre
 * d'entrées, taille unitaire et totale, ratio de compression) contre les
 * bombes ZIP. Retourne `[{ name, content }]` (répertoires ignorés).
 */
export function readZip(buffer, limits = ZIP_LIMITS) {
  try {
    return readZipUnsafe(buffer, limits);
  } catch (error) {
    if (error instanceof ValidationError || error instanceof PayloadTooLargeError) throw error;
    // Archive tronquée ou flux deflate invalide : jamais une erreur interne.
    throw new ValidationError('Archive ZIP invalide ou corrompue');
  }
}

function readZipUnsafe(buffer, limits) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) {
    throw new ValidationError('Archive ZIP invalide');
  }
  let endOffset = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65_557); i -= 1) {
    if (buffer.readUInt32LE(i) === END_OF_CENTRAL) {
      endOffset = i;
      break;
    }
  }
  if (endOffset < 0) throw new ValidationError('Archive ZIP invalide (fin introuvable)');
  const count = buffer.readUInt16LE(endOffset + 10);
  const centralOffset = buffer.readUInt32LE(endOffset + 16);
  if (count > limits.maxEntries) throw new PayloadTooLargeError('Archive ZIP : trop d’entrées');

  const entries = [];
  let total = 0;
  let cursor = centralOffset;
  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== CENTRAL_HEADER) {
      throw new ValidationError('Archive ZIP invalide (répertoire central)');
    }
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const crc = buffer.readUInt32LE(cursor + 16);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const size = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.toString('utf8', cursor + 46, cursor + 46 + nameLength);
    cursor += 46 + nameLength + extraLength + commentLength;

    if (name.endsWith('/')) continue;
    assertSafeEntryName(name);
    if (flags & 0x1) throw new ValidationError('Archive ZIP chiffrée non prise en charge');
    if (![0, 8].includes(method)) {
      throw new ValidationError(`Méthode de compression ZIP non prise en charge : ${method}`);
    }
    if (size > limits.maxEntryBytes)
      throw new PayloadTooLargeError(`Fichier trop volumineux : ${name}`);
    if (compressedSize > 0 && size / compressedSize > limits.maxCompressionRatio) {
      throw new PayloadTooLargeError(`Taux de compression suspect : ${name}`);
    }
    total += size;
    if (total > limits.maxTotalBytes)
      throw new PayloadTooLargeError('Archive ZIP trop volumineuse');

    if (buffer.readUInt32LE(localOffset) !== LOCAL_HEADER) {
      throw new ValidationError('Archive ZIP invalide (en-tête local)');
    }
    const localName = buffer.readUInt16LE(localOffset + 26);
    const localExtra = buffer.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localName + localExtra;
    const raw = buffer.subarray(start, start + compressedSize);
    const content =
      method === 8 ? inflateRawSync(raw, { maxOutputLength: limits.maxEntryBytes }) : raw;
    if (content.length !== size || crc32(content) !== crc) {
      throw new ValidationError(`Fichier corrompu dans l’archive : ${name}`);
    }
    entries.push({ name, content: Buffer.from(content) });
  }
  return entries;
}
