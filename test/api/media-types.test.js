import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { stopOcr } from '../../src/server/src/indexing/content-extract.js';
import { startTestServer, requestJson } from './helpers.js';
import { sniffMimeType } from '../../src/server/src/media/mime-sniffer.js';
import { MediaStorage } from '../../src/server/src/media/storage.js';
import { createZip } from '../../src/server/src/gedcom/zip.js';
import { PayloadTooLargeError, UnsupportedMediaTypeError } from '../../src/server/src/errors.js';

after(() => stopOcr());

const pad = (head, size = 64) => Buffer.concat([Buffer.from(head, 'latin1'), Buffer.alloc(size)]);
const ftyp = (brand) =>
  Buffer.concat([
    Buffer.from([0, 0, 0, 0x18]),
    Buffer.from(`ftyp${brand}`, 'latin1'),
    Buffer.alloc(16),
  ]);
const riff = (kind) =>
  Buffer.concat([
    Buffer.from('RIFF'),
    Buffer.from([0x24, 0, 0, 0]),
    Buffer.from(kind, 'latin1'),
    Buffer.alloc(32),
  ]);
const docx = (text = 'Texte du testament') =>
  createZip([
    { name: '[Content_Types].xml', content: Buffer.from('<Types/>') },
    {
      name: 'word/document.xml',
      content: Buffer.from(
        `<w:document><w:body><w:p><w:t>${text}</w:t></w:p></w:body></w:document>`,
      ),
    },
  ]);

const CASES = [
  ['image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10])],
  [
    'image/webp',
    Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBPVP8 ')]),
  ],
  ['image/tiff', Buffer.from([0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0])],
  ['application/pdf', Buffer.from('%PDF-1.4\n%âãÏÓ\n')],
  ['audio/mpeg', pad('ID3\x03\x00\x00')],
  ['audio/mpeg', Buffer.from([0xff, 0xfb, 0x90, 0x00, 0, 0, 0, 0])],
  ['audio/wav', riff('WAVEfmt ')],
  ['audio/ogg', pad('OggS\x00\x02')],
  ['audio/flac', pad('fLaC\x00\x00')],
  ['audio/mp4', ftyp('M4A ')],
  ['video/mp4', ftyp('isom')],
  ['video/mp4', ftyp('mp42')],
  ['video/quicktime', ftyp('qt  ')],
  ['video/webm', Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(16)])],
  ['video/x-msvideo', riff('AVI LIST')],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', docx()],
  ['text/plain', Buffer.from('Acte de naissance — Éléonore née à Nantes\n')],
  [
    'text/plain',
    Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('Texte UTF-16', 'utf16le')]),
  ],
];

test('le type réel est reconnu pour images, PDF, audio, vidéo, Word et texte', () => {
  for (const [mimeType, buffer] of CASES) {
    assert.equal(sniffMimeType(buffer)?.mimeType, mimeType, mimeType);
  }
  assert.equal(sniffMimeType(ftyp('M4A '))?.category, 'audio');
  assert.equal(sniffMimeType(ftyp('isom'))?.category, 'video');
  assert.equal(sniffMimeType(docx())?.category, 'document');
});

test('contenus refusés : exécutable, archive quelconque, RIFF inconnu, binaire, vide', () => {
  const rejected = {
    elf: Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00, 0, 0]),
    'archive ZIP quelconque': createZip([{ name: 'a.txt', content: Buffer.from('a') }]),
    'zip sans word/document.xml': createZip([
      { name: '[Content_Types].xml', content: Buffer.from('<x/>') },
    ]),
    'RIFF inconnu': riff('XXXXdata'),
    'ftyp inconnu': ftyp('zzzz'),
    'octets nuls': Buffer.from('texte\0caché'),
    'UTF-8 invalide': Buffer.from([0xc3, 0x28, 0x41, 0x42]),
    vide: Buffer.alloc(0),
  };
  for (const [label, buffer] of Object.entries(rejected)) {
    assert.equal(sniffMimeType(buffer), null, label);
  }
});

test('limites de taille par catégorie : documents, audio ×4, vidéo ×8', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'geneoapp-limits-'));
  try {
    const storage = new MediaStorage(root, { maxBytes: 100 });
    const sized = (buffer, size) => Buffer.concat([buffer, Buffer.alloc(size - buffer.length)]);
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    await storage.save(sized(png, 100));
    await assert.rejects(() => storage.save(sized(png, 101)), PayloadTooLargeError);
    await storage.save(sized(ftyp('M4A '), 400));
    await assert.rejects(() => storage.save(sized(ftyp('M4A '), 401)), PayloadTooLargeError);
    await storage.save(sized(ftyp('isom'), 800));
    await assert.rejects(() => storage.save(sized(ftyp('isom'), 801)), PayloadTooLargeError);
    await assert.rejects(() => storage.save(Buffer.alloc(801)), PayloadTooLargeError);
    await assert.rejects(
      () => storage.save(Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0, 0])),
      UnsupportedMediaTypeError,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

const upload = (server, body) =>
  requestJson(server.baseUrl, '/api/media', { method: 'POST', body });

test('texte et document Word : texte extrait, indexé et retrouvable par la recherche', async () => {
  const server = await startTestServer();
  try {
    const txt = await upload(server, {
      filename: 'lettre.txt',
      contentBase64: Buffer.from(
        'Cher cousin Hippolyte, la ferme de Kervignac est vendue.',
      ).toString('base64'),
    });
    assert.equal(txt.status, 201, JSON.stringify(txt.body));
    assert.equal(txt.body.mime_type, 'text/plain');
    assert.equal(txt.body.ocr_status, 'DONE');

    const word = await upload(server, {
      filename: 'testament.docx',
      contentBase64: docx('Je lègue mon horloge à Anselme').toString('base64'),
    });
    assert.equal(word.status, 201);
    assert.equal(word.body.ocr_status, 'DONE');
    assert.match(word.body.ocr_text, /horloge à Anselme/);

    const found = async (q) =>
      (
        await requestJson(
          server.baseUrl,
          `/api/search?${new URLSearchParams({ q, entityTypes: 'MEDIA' })}`,
        )
      ).body.map((hit) => hit.entity_id);
    assert.deepEqual(await found('Kervignac'), [txt.body.id]);
    assert.deepEqual(await found('horloge'), [word.body.id]);

    const download = await fetch(`${server.baseUrl}/api/media/${word.body.id}/content`);
    assert.equal(download.headers.get('x-content-type-options'), 'nosniff');
    assert.match(download.headers.get('content-disposition'), /^attachment/);
    const textDownload = await fetch(`${server.baseUrl}/api/media/${txt.body.id}/content`);
    assert.match(textDownload.headers.get('content-disposition'), /^inline/);
  } finally {
    await server.close();
  }
});

test('envoi en octets bruts : audio et vidéo, rattachement vérifié, erreurs claires', async () => {
  const server = await startTestServer();
  try {
    const person = (
      await requestJson(server.baseUrl, '/api/persons', {
        method: 'POST',
        body: { givenNames: 'Ada', familyName: 'L' },
      })
    ).body;
    const raw = (query, body) =>
      fetch(`${server.baseUrl}/api/media/raw?${new URLSearchParams(query)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream' },
        body,
      });

    const audio = await raw(
      { filename: 'voix.mp3', entityType: 'PERSON', entityId: person.id },
      pad('ID3\x03\x00\x00', 2048),
    );
    assert.equal(audio.status, 201);
    const record = await audio.json();
    assert.equal(record.mime_type, 'audio/mpeg');
    assert.equal(record.entity_id, person.id);
    assert.equal(record.ocr_status, 'UNAVAILABLE');
    const video = await raw({ filename: 'fete.mp4' }, ftyp('isom'));
    assert.equal(video.status, 201);
    assert.equal((await video.json()).mime_type, 'video/mp4');

    assert.equal(
      (await raw({ filename: 'x.bin' }, Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0, 0]))).status,
      415,
    );
    assert.equal((await raw({ filename: 'x.mp3' }, Buffer.alloc(0))).status, 400);
    assert.equal((await raw({}, pad('ID3\x03\x00\x00'))).status, 400, 'nom de fichier requis');
    assert.equal(
      (await raw({ filename: 'x.mp3', entityType: 'PERSON' }, pad('ID3\x03\x00\x00'))).status,
      400,
    );
    assert.equal(
      (
        await raw(
          { filename: 'x.mp3', entityType: 'PERSON', entityId: 9999 },
          pad('ID3\x03\x00\x00'),
        )
      ).status,
      404,
    );
    assert.equal(
      (await raw({ filename: 'x.mp3', sourceId: 'abc' }, pad('ID3\x03\x00\x00'))).status,
      400,
    );

    // Même contrôle de cible sur la route JSON.
    const json = await upload(server, {
      filename: 'a.txt',
      contentBase64: Buffer.from('texte').toString('base64'),
      entityType: 'EVENT',
      entityId: 9999,
    });
    assert.equal(json.status, 404);
  } finally {
    await server.close();
  }
});
