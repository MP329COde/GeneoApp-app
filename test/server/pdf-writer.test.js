import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PdfDocument,
  encodeWinAnsi,
  readJpegInfo,
  textWidth,
  wrapText,
} from '../../src/server/src/reports/pdf-writer.js';
import { stripMarkdown } from '../../src/server/src/reports/book-pdf.js';

test('encodage WinAnsi : accents, guillemets typographiques, inconnu remplacé', () => {
  assert.deepEqual([...encodeWinAnsi('é')], [0xe9]);
  assert.deepEqual([...encodeWinAnsi('’–…œ€')], [0x92, 0x96, 0x85, 0x9c, 0x80]);
  assert.deepEqual([...encodeWinAnsi('日')], [0x3f]);
});

test('largeur et retour à la ligne', () => {
  assert.ok(textWidth('Hello', 10) > 0);
  assert.equal(textWidth('é', 10), textWidth('e', 10));
  assert.ok(textWidth('Hello', 10, true) > textWidth('Hello', 10));
  const lines = wrapText('un deux trois quatre cinq six sept huit', 12, 80);
  assert.ok(lines.length > 1);
  for (const line of lines) assert.ok(textWidth(line, 12) <= 80);
  // Un mot plus long que la ligne est coupé au lieu de déborder.
  for (const line of wrapText('A'.repeat(200), 12, 80)) assert.ok(textWidth(line, 12) <= 80);
});

test('lecture des dimensions JPEG et rejet des autres fichiers', () => {
  const jpeg = Buffer.from([
    0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x20, 0x00, 0x30, 0x03, 0x01, 0x22, 0x00, 0x02,
    0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9,
  ]);
  assert.deepEqual(readJpegInfo(jpeg), { width: 48, height: 32, components: 3 });
  assert.equal(readJpegInfo(Buffer.from('pas un jpeg')), null);
});

test('document PDF : structure, table xref, signets et métadonnées', () => {
  const document = new PdfDocument({ title: 'Titre éé', author: 'A' });
  const page = document.addPage();
  page.text(50, 700, 'Bonjour');
  page.bookmark('Chapitre', 0);
  page.bookmark('Sous-chapitre', 1);
  document.addPage().text(50, 700, 'Page 2');
  const pdf = document.toBuffer();
  const raw = pdf.toString('latin1');
  assert.ok(raw.startsWith('%PDF-1.4'));
  assert.ok(raw.trimEnd().endsWith('%%EOF'));
  assert.match(raw, /\/Count 2 >>/);
  assert.match(raw, /\/Type \/Outlines/);
  // Chaque entrée xref pointe sur le début d'un « n 0 obj ».
  const startxref = Number(/startxref\n(\d+)/.exec(raw)[1]);
  assert.ok(raw.slice(startxref).startsWith('xref'));
  const entries = [...raw.slice(startxref).matchAll(/(\d{10}) 00000 n /g)];
  assert.ok(entries.length > 5);
  entries.forEach((entry, index) => {
    assert.ok(raw.slice(Number(entry[1])).startsWith(`${index + 1} 0 obj`));
  });
});

test('notes : le Markdown est converti en texte brut', () => {
  assert.equal(
    stripMarkdown('## Titre\n**gras** et *italique*\n- item'),
    'Titre\ngras et italique\n• item',
  );
  assert.equal(stripMarkdown('[site](https://exemple.org)'), 'site (https://exemple.org)');
});
