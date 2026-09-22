import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MediaStorage } from '../../src/server/src/media/storage.js';
import { PayloadTooLargeError, UnsupportedMediaTypeError } from '../../src/server/src/errors.js';

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

async function withTempStorage(fn, options) {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'geneoapp-storage-test-'));
  try {
    await fn(new MediaStorage(rootDir, options), rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

test('save() écrit le fichier sous un nom généré côté serveur, jamais dérivé de l’entrée', async () => {
  await withTempStorage(async (storage, rootDir) => {
    const result = await storage.save(PNG_BYTES);

    assert.match(result.storedFilename, /^[0-9a-f-]{36}\.png$/);
    assert.equal(result.mimeType, 'image/png');
    assert.equal(result.sizeBytes, PNG_BYTES.length);

    const files = await readdir(rootDir);
    assert.deepEqual(files, [result.storedFilename]);

    const read = await storage.read(result.storedFilename);
    assert.ok(read.equals(PNG_BYTES));
  });
});

test('le type réel du contenu est déterminé par ses octets, pas par le nom ou le Content-Type déclarés', async () => {
  await withTempStorage(async (storage) => {
    const fakeImage = Buffer.from('#!/bin/sh\necho "not an image"\n');
    await assert.rejects(() => storage.save(fakeImage), UnsupportedMediaTypeError);
  });
});

test('un fichier dépassant la taille maximale configurée est rejeté', async () => {
  await withTempStorage(
    async (storage) => {
      const oversized = Buffer.concat([PNG_BYTES, Buffer.alloc(100)]);
      await assert.rejects(() => storage.save(oversized), PayloadTooLargeError);
    },
    { maxBytes: 8 },
  );
});

test('resolveSafePath rejette toute tentative de traversée de chemin', async () => {
  await withTempStorage(async (storage) => {
    assert.throws(() => storage.resolveSafePath('../../etc/passwd'));
    assert.throws(() => storage.resolveSafePath('sous-dossier/fichier.png'));
    assert.throws(() => storage.resolveSafePath('/etc/passwd'));
  });
});
