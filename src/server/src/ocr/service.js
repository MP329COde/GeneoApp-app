import { runTesseract } from './tesseract-runner.js';

const OCR_ELIGIBLE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/tiff',
  'image/gif',
  'image/webp',
  'application/pdf',
]);

/**
 * Orchestration de la reconnaissance optique de caractères. N'effectue
 * jamais d'appel réseau : si l'outil `tesseract` n'est pas installé sur la
 * machine locale, l'OCR est marqué indisponible plutôt que de tenter un
 * service distant de substitution.
 */
export class OcrService {
  constructor({ runner = runTesseract } = {}) {
    this.runner = runner;
  }

  isEligible(mimeType) {
    return OCR_ELIGIBLE_MIME_TYPES.has(mimeType);
  }

  async run(absolutePath, mimeType) {
    if (!this.isEligible(mimeType)) {
      return { status: 'UNAVAILABLE', text: null };
    }

    try {
      const text = await this.runner(absolutePath);
      return { status: 'DONE', text: text.trim() };
    } catch (error) {
      if (error && (error.code === 'ENOENT' || error.code === 'ETIMEDOUT')) {
        return { status: 'UNAVAILABLE', text: null };
      }
      return { status: 'FAILED', text: null };
    }
  }
}
