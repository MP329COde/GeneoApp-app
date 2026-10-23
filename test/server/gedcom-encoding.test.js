import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeAnsel, decodeGedcomBuffer } from '../../src/server/src/gedcom/encoding.js';
import { parseGedcom, validateGedcom } from '../../src/server/src/gedcom/index.js';

const body = (charset, name = 'Jean /Éléonore Dupré/') =>
  `0 HEAD\n1 GEDC\n2 VERS 5.5.1\n${charset ? `1 CHAR ${charset}\n` : ''}0 @I1@ INDI\n1 NAME ${name}\n0 TRLR\n`;

test('UTF-8 avec ou sans BOM', () => {
  const plain = decodeGedcomBuffer(Buffer.from(body('UTF-8')));
  assert.equal(plain.encoding, 'UTF-8');
  assert.match(plain.text, /Éléonore Dupré/);
  const withBom = decodeGedcomBuffer(
    Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(body('UTF-8'))]),
  );
  assert.equal(withBom.text.charCodeAt(0), '0'.charCodeAt(0), 'BOM retiré');
});

test('UTF-16 little et big endian avec BOM', () => {
  const text = body('UNICODE');
  const le = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]);
  assert.deepEqual(decodeGedcomBuffer(le), { text, encoding: 'UTF-16LE' });
  const be = Buffer.from(le.subarray(2));
  be.swap16();
  const decoded = decodeGedcomBuffer(Buffer.concat([Buffer.from([0xfe, 0xff]), be]));
  assert.equal(decoded.encoding, 'UTF-16BE');
  assert.equal(decoded.text, text);
});

test('Windows-1252 / ANSI : déclaré, ou détecté faute de UTF-8 valide', () => {
  const ansi = Buffer.from(body('ANSI'), 'latin1');
  const declared = decodeGedcomBuffer(ansi);
  assert.equal(declared.encoding, 'WINDOWS-1252');
  assert.match(declared.text, /Éléonore Dupré/);
  // Euro et guillemets typographiques : spécifiques à Windows-1252, absents de latin-1.
  const special = decodeGedcomBuffer(
    Buffer.from([...Buffer.from('0 HEAD\n1 CHAR ANSI\n1 NOTE '), 0x80, 0x93, 0x94]),
  );
  assert.match(special.text, /€“”/);
  const undeclared = decodeGedcomBuffer(Buffer.from(body(null), 'latin1'));
  assert.equal(undeclared.encoding, 'WINDOWS-1252');
  assert.match(undeclared.text, /Dupré/);
});

test('ANSEL : signes diacritiques avant la lettre et caractères spéciaux', () => {
  // é = acute (E2) + e ; ç = cedilla (F0) + c ; ï = diaeresis (E8) + i ; ø ; ł
  const bytes = Buffer.from([0xe2, 0x65, 0xf0, 0x63, 0xe8, 0x69, 0xb2, 0xb1, 0x41]);
  assert.equal(decodeAnsel(bytes), 'éçïøłA');
  const file = Buffer.concat([
    Buffer.from('0 HEAD\n1 GEDC\n2 VERS 5.5\n1 CHAR ANSEL\n0 @I1@ INDI\n1 NAME Ren'),
    Buffer.from([0xe2, 0x65]),
    Buffer.from(' /Lef'),
    Buffer.from([0xe1, 0x65]),
    Buffer.from('vre/\n0 TRLR\n'),
  ]);
  const decoded = decodeGedcomBuffer(file);
  assert.equal(decoded.encoding, 'ANSEL');
  assert.match(decoded.text, /René \/Lefèvre\//);
});

test('ASCII déclaré, et analyse tolérante aux espaces en début de ligne', () => {
  assert.equal(decodeGedcomBuffer(Buffer.from(body('ASCII', 'Jean /Dupont/'))).encoding, 'ASCII');
  const indented = '  0 HEAD\n\t1 GEDC\n  2 VERS 5.5.1\n0 @I1@ INDI\n  1 NAME Ada /L/\n0 TRLR\n';
  const report = validateGedcom(parseGedcom(indented));
  assert.equal(report.valid, true);
  assert.equal(report.summary.individuals, 1);
});
