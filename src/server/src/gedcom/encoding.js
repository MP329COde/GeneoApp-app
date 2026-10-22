// Décodage des fichiers GEDCOM selon leur encodage réel.
//
// Un .ged n'est pas toujours de l'UTF-8 : les logiciels anciens écrivent de
// l'ANSEL (norme GEDCOM 5.5), du Windows-1252 (« ANSI »), de l'ASCII ou de
// l'UTF-16. Lire ces octets comme de l'UTF-8 remplace les accents par « � »
// sans erreur visible : le décodage doit donc se faire AVANT l'analyse, d'après
// la marque d'ordre des octets (BOM) ou la balise `1 CHAR` de l'en-tête.
// Le fichier n'est jamais « deviné » en silence : l'encodage retenu est renvoyé
// pour être affiché dans le rapport.

// Caractères spéciaux ANSEL (0xA1-0xC6) → Unicode.
const ANSEL_SPECIAL = new Map(
  Object.entries({
    0xa1: 'Ł',
    0xa2: 'Ø',
    0xa3: 'Đ',
    0xa4: 'Þ',
    0xa5: 'Æ',
    0xa6: 'Œ',
    0xa7: 'ʹ',
    0xa8: '·',
    0xa9: '♭',
    0xaa: '®',
    0xab: '±',
    0xac: 'Ơ',
    0xad: 'Ư',
    0xae: 'ʼ',
    0xb0: 'ʻ',
    0xb1: 'ł',
    0xb2: 'ø',
    0xb3: 'đ',
    0xb4: 'þ',
    0xb5: 'æ',
    0xb6: 'œ',
    0xb7: 'ʺ',
    0xb8: 'ı',
    0xb9: '£',
    0xba: 'ð',
    0xbc: 'ơ',
    0xbd: 'ư',
    0xc0: '°',
    0xc1: 'ℓ',
    0xc2: '℗',
    0xc3: '©',
    0xc4: '♯',
    0xc5: '¿',
    0xc6: '¡',
  }).map(([code, char]) => [Number(code), char]),
);

// Signes diacritiques ANSEL (0xE0-0xFE) → caractère combinant Unicode. En ANSEL
// le signe PRÉCÈDE la lettre, en Unicode il la SUIT.
const ANSEL_COMBINING = new Map(
  Object.entries({
    0xe0: 0x0309,
    0xe1: 0x0300,
    0xe2: 0x0301,
    0xe3: 0x0302,
    0xe4: 0x0303,
    0xe5: 0x0304,
    0xe6: 0x0306,
    0xe7: 0x0307,
    0xe8: 0x0308,
    0xe9: 0x030c,
    0xea: 0x030a,
    0xee: 0x030b,
    0xef: 0x0310,
    0xf0: 0x0327,
    0xf1: 0x0328,
    0xf2: 0x0323,
    0xf3: 0x0324,
    0xf4: 0x0325,
    0xf5: 0x0333,
    0xf6: 0x0332,
    0xf7: 0x0326,
    0xf8: 0x0321,
    0xf9: 0x032e,
    0xfe: 0x0313,
  }).map(([code, point]) => [Number(code), String.fromCodePoint(point)]),
);

export function decodeAnsel(buffer) {
  let output = '';
  let pending = '';
  for (const byte of buffer) {
    if (ANSEL_COMBINING.has(byte)) {
      pending += ANSEL_COMBINING.get(byte);
      continue;
    }
    const char = byte < 0x80 ? String.fromCharCode(byte) : (ANSEL_SPECIAL.get(byte) ?? '�');
    output += char + pending;
    pending = '';
  }
  return (output + pending).normalize('NFC');
}

function decodeStrictUtf8(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(buffer);
  } catch {
    return null;
  }
}

/** Valeur de `1 CHAR` d'un en-tête lu en latin-1 (les balises sont en ASCII). */
function declaredCharset(buffer) {
  const head = new TextDecoder('latin1').decode(buffer.subarray(0, 4096));
  return /^\s*1\s+CHAR\s+([^\r\n]+)/im.exec(head)?.[1]?.trim().toUpperCase() ?? null;
}

/**
 * Décode un fichier GEDCOM. Renvoie `{ text, encoding }` ; `encoding` nomme
 * l'encodage retenu (UTF-8, UTF-16LE, UTF-16BE, WINDOWS-1252, ANSEL, ASCII).
 */
export function decodeGedcomBuffer(input) {
  // Uint8Array (et donc Buffer) uniquement, sans API propre à Node : le même
  // décodeur sert au serveur et au navigateur (ouverture d'un fichier choisi).
  const buffer = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return { text: new TextDecoder('utf-8').decode(buffer.subarray(3)), encoding: 'UTF-8' };
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return { text: new TextDecoder('utf-16le').decode(buffer.subarray(2)), encoding: 'UTF-16LE' };
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return { text: new TextDecoder('utf-16be').decode(buffer.subarray(2)), encoding: 'UTF-16BE' };
  }

  const charset = declaredCharset(buffer);
  if (charset === 'ANSEL') return { text: decodeAnsel(buffer), encoding: 'ANSEL' };
  if (
    charset &&
    /^(ANSI|WINDOWS-1252|CP1252|ISO-?8859-?1|LATIN1|IBMPC|IBM WINDOWS)$/.test(charset)
  ) {
    return { text: new TextDecoder('windows-1252').decode(buffer), encoding: 'WINDOWS-1252' };
  }
  const utf8 = decodeStrictUtf8(buffer);
  if (utf8 !== null) {
    const ascii = !/[^\x00-\x7f]/.test(utf8);
    return { text: utf8, encoding: ascii && charset === 'ASCII' ? 'ASCII' : 'UTF-8' };
  }
  // Octets non UTF-8 sans encodage déclaré (ou déclaré à tort) : le cas le plus
  // courant est Windows-1252 ; l'encodage retenu figure dans le rapport.
  return { text: new TextDecoder('windows-1252').decode(buffer), encoding: 'WINDOWS-1252' };
}
