import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deflateRawSync } from 'node:zlib';
import { assertSafeEntryName, createZip, crc32, readZip } from '../../src/server/src/gedcom/zip.js';

test('aller-retour ZIP : contenu, noms UTF-8 et compression préservés', () => {
  const entries = [
    { name: 'gedcom.ged', content: Buffer.from('0 HEAD\n'.repeat(200)) },
    { name: 'media/1-été.png', content: Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]) },
  ];
  const archive = createZip(entries);
  const read = readZip(archive);
  assert.deepEqual(
    read.map((entry) => entry.name),
    ['gedcom.ged', 'media/1-été.png'],
  );
  assert.ok(read[0].content.equals(entries[0].content));
  assert.ok(read[1].content.equals(entries[1].content));
  assert.ok(archive.length < entries[0].content.length, 'le texte répétitif est compressé');
});

test('refuse les chemins dangereux (traversée, absolu, lecteur Windows)', () => {
  for (const name of ['../evil', '/etc/passwd', 'a/../../b', 'C:/x', 'a\\b', '', './x']) {
    assert.throws(() => assertSafeEntryName(name), /refusé/, name);
  }
  assert.equal(assertSafeEntryName('media/photo.jpg'), 'media/photo.jpg');
});

test('rejette une archive dont une entrée est corrompue (CRC)', () => {
  const archive = createZip([{ name: 'a.txt', content: Buffer.from('bonjour tout le monde') }]);
  const tampered = Buffer.from(archive);
  const dataStart = 30 + 'a.txt'.length;
  tampered[dataStart] ^= 0xff;
  assert.throws(() => readZip(tampered));
});

test('bloque une bombe ZIP (taux de compression excessif)', () => {
  const huge = Buffer.alloc(5 * 1024 * 1024, 0);
  const archive = createZip([{ name: 'bombe.bin', content: huge }]);
  assert.ok(deflateRawSync(huge).length * 200 < huge.length);
  assert.throws(() => readZip(archive), /compression suspect/);
});

test('crc32 correspond à la valeur de référence', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
});

test('une archive tronquée donne une erreur de validation, jamais une erreur interne', () => {
  const archive = createZip([{ name: 'a.txt', content: Buffer.from('x'.repeat(1000)) }]);
  const truncated = Buffer.concat([archive.subarray(0, 40), archive.subarray(archive.length - 22)]);
  assert.throws(
    () => readZip(truncated),
    (error) => error.name === 'ValidationError' || /invalide/.test(error.message),
  );
});
