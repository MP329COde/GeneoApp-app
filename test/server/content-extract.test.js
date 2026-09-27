import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, test } from 'node:test';
import { createZip } from '../../src/server/src/gedcom/zip.js';
import { stopOcr } from '../../src/server/src/indexing/content-extract.js';
import { extractText } from '../../src/server/src/indexing/text-extract.js';

after(() => stopOcr());

const fixture = (name) => readFile(new URL(`../fixtures/${name}`, import.meta.url));

/** PDF minimal avec du texte réel (police standard Helvetica). */
function textPdf(text) {
  const stream = `BT /F1 18 Tf 50 750 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  return pdfFrom(objects.map((body) => Buffer.from(body, 'latin1')));
}

/** PDF « scanné » : une page qui n'est qu'une image JPEG. */
function scannedPdf(jpeg) {
  const draw = 'q 700 110 0 0 cm /Im1 Do Q';
  const objects = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    Buffer.from(
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 700 110] /Contents 4 0 R /Resources << /XObject << /Im1 5 0 R >> >> >>',
    ),
    Buffer.from(`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`),
    Buffer.concat([
      Buffer.from(
        `<< /Type /XObject /Subtype /Image /Width 1400 /Height 220 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
      ),
      jpeg,
      Buffer.from('\nendstream'),
    ]),
  ];
  return pdfFrom(objects);
}

function pdfFrom(objects) {
  const parts = [Buffer.from('%PDF-1.4\n')];
  const offsets = [];
  let length = parts[0].length;
  objects.forEach((body, index) => {
    offsets.push(length);
    const chunk = Buffer.concat([
      Buffer.from(`${index + 1} 0 obj\n`),
      body,
      Buffer.from('\nendobj\n'),
    ]);
    parts.push(chunk);
    length += chunk.length;
  });
  const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join(
      '',
    )}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`;
  parts.push(Buffer.from(xref));
  return Buffer.concat(parts);
}

test('OCR embarqué : le texte d’une image scannée est reconnu, sans logiciel installé', async () => {
  const result = await extractText({
    buffer: await fixture('registre-scan.png'),
    filename: 'scan.png',
  });
  assert.equal(result.status, 'OCR');
  assert.match(result.text, /Registre/i);
  assert.match(result.text, /Rouen/i);
});

test('PDF texte : contenu extrait directement', async () => {
  const result = await extractText({
    buffer: textPdf('Acte de mariage Elbeuf 1812'),
    filename: 'acte.pdf',
  });
  assert.equal(result.status, 'EXTRACTED');
  assert.match(result.text, /mariage Elbeuf 1812/);
});

test('PDF scanné : les pages images passent à l’OCR', async () => {
  const pdf = scannedPdf(await fixture('registre-scan.jpg'));
  const result = await extractText({ buffer: pdf, filename: 'registre.pdf' });
  assert.equal(result.status, 'OCR');
  assert.match(result.text, /Rouen/i);
});

test('Word et LibreOffice : texte des documents bureautiques', async () => {
  const docx = createZip([
    {
      name: 'word/document.xml',
      content: Buffer.from(
        '<w:document><w:body><w:p><w:r><w:t>Testament de Pierre</w:t></w:r></w:p><w:p><w:r><w:t>Lef&#232;vre</w:t></w:r></w:p></w:body></w:document>',
      ),
    },
  ]);
  const word = await extractText({ buffer: docx, filename: 'testament.docx' });
  assert.equal(word.status, 'EXTRACTED');
  assert.match(word.text, /Testament de Pierre\nLefèvre/);

  const odt = createZip([
    {
      name: 'content.xml',
      content: Buffer.from('<office:text><text:p>Recensement 1836</text:p></office:text>'),
    },
  ]);
  assert.match(
    (await extractText({ buffer: odt, filename: 'notes.odt' })).text,
    /Recensement 1836/,
  );
});

test('fichier illisible : trouvable par son nom, jamais d’erreur', async () => {
  const result = await extractText({ buffer: Buffer.from('pas un zip'), filename: 'casse.docx' });
  assert.deepEqual([result.status, result.title], ['UNAVAILABLE', 'casse.docx']);
});
