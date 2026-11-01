import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { stopOcr } from '../../src/server/src/indexing/content-extract.js';
import { OcrService } from '../../src/server/src/ocr/service.js';

after(() => stopOcr());

const fixture = (name) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));

test('OcrService : lit réellement une image fournie (OCR embarqué, sans tesseract installé)', async () => {
  const result = await new OcrService().run(fixture('registre-scan.png'), 'image/png');
  assert.equal(result.status, 'DONE');
  assert.match(result.text, /Registre/i);
  assert.match(result.text, /Rouen/i);
});

test('OcrService : un type non éligible est indisponible, sans erreur', async () => {
  const result = await new OcrService().run(fixture('sample.ged'), 'text/plain');
  assert.deepEqual(result, { status: 'UNAVAILABLE', text: null });
});

test('OcrService : comportement dégradé clair (moteur absent → UNAVAILABLE, échec → FAILED)', async () => {
  const absent = new OcrService({
    runner: async () => {
      throw Object.assign(new Error('absent'), { code: 'ENOENT' });
    },
  });
  assert.equal((await absent.run('/x.png', 'image/png')).status, 'UNAVAILABLE');
  const broken = new OcrService({
    runner: async () => {
      throw new Error('image corrompue');
    },
  });
  assert.equal((await broken.run('/x.png', 'image/png')).status, 'FAILED');
});

test('OcrService : une image illisible ne fait pas tomber le serveur', async () => {
  const result = await new OcrService().run(fixture('sample.png'), 'image/png');
  assert.ok(['FAILED', 'DONE'].includes(result.status));
});
