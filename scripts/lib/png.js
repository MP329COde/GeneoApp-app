// Codec PNG minimal (lecture/écriture) bâti sur zlib, sans dépendance
// externe. Il sert à comparer des captures d'écran pixel à pixel : lire un
// PNG de capture Playwright (RGBA, 8 bits, non entrelacé) et écrire un PNG
// de différence. Volontairement limité à ce que Chromium produit, afin de
// ne pas embarquer une bibliothèque complète dans l'outillage du projet.
//
// Tout est synchrone et sans état : ce module est un utilitaire de test.

import { inflateSync, deflateSync } from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Somme de contrôle CRC-32 (polynôme 0xedb88320), table calculée une fois.
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

// Filtre "None" (0) : les pixels sont stockés tels quels. C'est le format le
// plus simple, et la taille reste correcte grâce à la compression zlib.
function encodeRaw(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return deflateSync(raw, { level: 9 });
}

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/**
 * Écrit un PNG RGBA 8 bits (non entrelacé) dans un Buffer.
 * @param {number} width
 * @param {number} height
 * @param {Buffer} rgba données RGBA, `width * height * 4` octets
 * @returns {Buffer}
 */
export function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // profondeur
  header[9] = 6; // type de couleur : RGBA
  header[10] = 0; // compression
  header[11] = 0; // filtre
  header[12] = 0; // entrelacement
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', encodeRaw(width, height, rgba)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Lit un PNG 8 bits (vraie couleur ou palette, avec ou sans alpha) et renvoie
 * les pixels RGBA. Les captures Playwright sortent en RGBA ; la lecture des
 * palettes et des niveaux de gris couvre les PNG de référence produits par
 * d'autres outils.
 * @param {Buffer} buffer
 * @returns {{ width: number, height: number, data: Buffer }}
 */
export function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('Ce n’est pas un fichier PNG');
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  let palette = null;
  let transparency = null;
  const idat = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'PLTE') {
      palette = Buffer.from(data);
    } else if (type === 'tRNS') {
      transparency = Buffer.from(data);
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(data));
    } else if (type === 'IEND') {
      break;
    }
  }

  if (bitDepth !== 8) {
    throw new Error(`Profondeur PNG non gérée : ${bitDepth} bits`);
  }
  if (interlace !== 0) {
    throw new Error('PNG entrelacé non géré');
  }

  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`Type de couleur PNG non géré : ${colorType}`);

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(width * height * 4);
  const previous = Buffer.alloc(stride);
  const current = Buffer.alloc(stride);

  let position = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[position];
    position += 1;
    raw.copy(current, 0, position, position + stride);
    position += stride;

    // Reconstruction du filtre appliqué par l'encodeur.
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? current[x - channels] : 0;
      const up = previous[x];
      const upLeft = x >= channels ? previous[x - channels] : 0;
      switch (filter) {
        case 0:
          break;
        case 1:
          current[x] = (current[x] + left) & 0xff;
          break;
        case 2:
          current[x] = (current[x] + up) & 0xff;
          break;
        case 3:
          current[x] = (current[x] + ((left + up) >> 1)) & 0xff;
          break;
        case 4:
          current[x] = (current[x] + paethPredictor(left, up, upLeft)) & 0xff;
          break;
        default:
          throw new Error(`Filtre PNG inconnu : ${filter}`);
      }
    }

    for (let x = 0; x < width; x += 1) {
      const source = x * channels;
      const target = (y * width + x) * 4;
      if (colorType === 0) {
        pixels[target] = current[source];
        pixels[target + 1] = current[source];
        pixels[target + 2] = current[source];
        pixels[target + 3] = 255;
      } else if (colorType === 2) {
        pixels[target] = current[source];
        pixels[target + 1] = current[source + 1];
        pixels[target + 2] = current[source + 2];
        pixels[target + 3] = 255;
      } else if (colorType === 3) {
        const index = current[source];
        pixels[target] = palette[index * 3];
        pixels[target + 1] = palette[index * 3 + 1];
        pixels[target + 2] = palette[index * 3 + 2];
        pixels[target + 3] = transparency?.[index] ?? 255;
      } else if (colorType === 4) {
        pixels[target] = current[source];
        pixels[target + 1] = current[source];
        pixels[target + 2] = current[source];
        pixels[target + 3] = current[source + 1];
      } else {
        pixels[target] = current[source];
        pixels[target + 1] = current[source + 1];
        pixels[target + 2] = current[source + 2];
        pixels[target + 3] = current[source + 3];
      }
    }

    current.copy(previous);
  }

  return { width, height, data: pixels };
}

/**
 * Compare deux images RGBA et renvoie le nombre de pixels différents ainsi
 * qu'une image de différence (les pixels différents sont marqués en rouge,
 * les autres sont assombris pour rester lisibles).
 * @param {{width:number,height:number,data:Buffer}} a
 * @param {{width:number,height:number,data:Buffer}} b
 * @param {{ threshold?: number }} options seuil par canal (0-255)
 */
export function compareImages(a, b, { threshold = 16 } = {}) {
  if (a.width !== b.width || a.height !== b.height) {
    return {
      sameSize: false,
      differentPixels: Math.max(a.width * a.height, b.width * b.height),
      totalPixels: Math.max(a.width * a.height, b.width * b.height),
      ratio: 1,
      diff: null,
    };
  }

  const total = a.width * a.height;
  const diff = Buffer.alloc(total * 4);
  let different = 0;

  for (let index = 0; index < total; index += 1) {
    const offset = index * 4;
    const deltaRed = Math.abs(a.data[offset] - b.data[offset]);
    const deltaGreen = Math.abs(a.data[offset + 1] - b.data[offset + 1]);
    const deltaBlue = Math.abs(a.data[offset + 2] - b.data[offset + 2]);
    const deltaAlpha = Math.abs(a.data[offset + 3] - b.data[offset + 3]);
    const isDifferent =
      deltaRed > threshold ||
      deltaGreen > threshold ||
      deltaBlue > threshold ||
      deltaAlpha > threshold;

    if (isDifferent) {
      different += 1;
      diff[offset] = 255;
      diff[offset + 1] = 0;
      diff[offset + 2] = 0;
      diff[offset + 3] = 255;
    } else {
      // Assombrit les pixels identiques : le contraste met en évidence le rouge.
      const grey = (a.data[offset] + a.data[offset + 1] + a.data[offset + 2]) / 3;
      const faded = Math.round(grey * 0.25);
      diff[offset] = faded;
      diff[offset + 1] = faded;
      diff[offset + 2] = faded;
      diff[offset + 3] = 255;
    }
  }

  return {
    sameSize: true,
    differentPixels: different,
    totalPixels: total,
    ratio: total === 0 ? 0 : different / total,
    diff: { width: a.width, height: a.height, data: diff },
  };
}
