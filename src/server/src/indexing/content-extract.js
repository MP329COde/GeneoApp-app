import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readZip } from '../gedcom/zip.js';
import { decodeEntities } from './text-extract.js';

// Extraction du contenu réel des fichiers, entièrement locale : OCR en
// WebAssembly (tesseract.js, données de langue embarquées, aucun
// téléchargement), texte des PDF (pdfjs), documents bureautiques (XML zippé).

const require = createRequire(import.meta.url);
export const OCR_LIMITS = Object.freeze({ maxImagesPerFile: 40, timeoutMs: 120_000 });

let workerPromise = null;

/** Moteur OCR partagé, créé à la première utilisation. */
function ocrWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js');
      const langPath = path.join(
        path.dirname(require.resolve('@tesseract.js-data/fra/package.json')),
        '4.0.0_best_int',
      );
      return createWorker('fra', 1, {
        langPath,
        gzip: true,
        cachePath: path.join(tmpdir(), 'geneoapp-ocr-cache'),
        logger: () => {},
        errorHandler: () => {},
      });
    })().catch((error) => {
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
}

export async function stopOcr() {
  if (!workerPromise) return;
  const worker = await workerPromise.catch(() => null);
  workerPromise = null;
  await worker?.terminate();
}

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('OCR trop long')), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

export async function ocrImage(buffer) {
  const worker = await ocrWorker();
  const { data } = await withTimeout(worker.recognize(buffer), OCR_LIMITS.timeoutMs);
  return (data?.text ?? '').trim();
}

/** Images JPEG intégrées d'un PDF (pages scannées : flux /DCTDecode). */
export function embeddedJpegs(pdf, limit = OCR_LIMITS.maxImagesPerFile) {
  const images = [];
  let index = 0;
  while (images.length < limit) {
    const filter = pdf.indexOf('/DCTDecode', index);
    if (filter < 0) break;
    const streamStart = pdf.indexOf('stream', filter);
    if (streamStart < 0) break;
    let dataStart = streamStart + 'stream'.length;
    if (pdf[dataStart] === 0x0d) dataStart += 1;
    if (pdf[dataStart] === 0x0a) dataStart += 1;
    const dataEnd = pdf.indexOf('endstream', dataStart);
    if (dataEnd < 0) break;
    const jpeg = pdf.subarray(dataStart, dataEnd);
    const end = jpeg.lastIndexOf(Buffer.from([0xff, 0xd9]));
    if (jpeg[0] === 0xff && jpeg[1] === 0xd8 && end > 0) images.push(jpeg.subarray(0, end + 2));
    index = dataEnd;
  }
  return images;
}

export async function pdfText(buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  });
  const document = await task.promise;
  const pages = [];
  try {
    for (let number = 1; number <= Math.min(document.numPages, 500); number += 1) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => item.str ?? '').join(' '));
    }
  } finally {
    await task.destroy();
  }
  return {
    text: pages
      .join('\n')
      .replace(/[ \t]+/g, ' ')
      .trim(),
    pages: pages.length,
  };
}

const OFFICE_PARTS = [
  /^word\/(document|footnotes|endnotes)\.xml$/,
  /^word\/header\d*\.xml$/,
  /^xl\/sharedStrings\.xml$/,
  /^ppt\/slides\/slide\d+\.xml$/,
  /^content\.xml$/,
];

/** Texte d'un document Word, Excel, PowerPoint ou LibreOffice. */
export function officeText(buffer) {
  const parts = readZip(buffer).filter((entry) =>
    OFFICE_PARTS.some((part) => part.test(entry.name)),
  );
  return decodeEntities(
    parts
      .map((entry) =>
        entry.content
          .toString('utf8')
          .replace(/<\/(w:p|text:p|text:h|a:p|si)>/g, '\n')
          .replace(/<(w:tab|text:tab)\/>/g, ' ')
          .replace(/<[^>]+>/g, ''),
      )
      .join('\n'),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

/**
 * Contenu d'un PDF : texte intégré, sinon OCR des pages scannées.
 * Retourne { text, status } avec status EXTRACTED, OCR ou UNAVAILABLE.
 */
export async function pdfContent(buffer, { ocr = ocrImage } = {}) {
  let text = '';
  let pages = 1;
  try {
    ({ text, pages } = await pdfText(buffer));
  } catch {
    // PDF illisible par pdfjs : on tente tout de même l'OCR des images.
  }
  if (text.replace(/\s/g, '').length >= 20 * Math.max(1, Math.min(pages, 3))) {
    return { text, status: 'EXTRACTED' };
  }
  const recognized = [];
  for (const jpeg of embeddedJpegs(buffer)) {
    try {
      recognized.push(await ocr(jpeg));
    } catch {
      // page illisible : on continue
    }
  }
  const combined = [text, ...recognized].join('\n').trim();
  return combined
    ? { text: combined, status: recognized.length ? 'OCR' : 'EXTRACTED' }
    : { text: '', status: 'UNAVAILABLE' };
}
