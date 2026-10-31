import { BookData } from '../reports/book-data.js';
import { renderBookPdf } from '../reports/book-pdf.js';

function slug(text) {
  return (
    String(text)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 50) || 'livre'
  );
}

/**
 * Rapports imprimables générés localement. Le livre généalogique est produit
 * par un écrivain PDF interne (aucun service externe, aucune dépendance).
 */
export class ReportService {
  constructor(database, { media } = {}) {
    this.data = new BookData(database, {
      readMedia: media ? (storedFilename) => media.storage.read(storedFilename) : null,
    });
  }

  /**
   * Livre PDF d'un arbre ou d'une branche. Renvoie le fichier encodé en base64
   * (même convention que l'export GEDZIP, valable pour HTTP et IPC).
   */
  async buildBook(options = {}) {
    const book = await this.data.collect(options);
    const pdf = renderBookPdf(book);
    return {
      filename: `${slug(book.title)}.pdf`,
      mimeType: 'application/pdf',
      sizeBytes: pdf.length,
      contentBase64: pdf.toString('base64'),
      summary: {
        persons: book.sheets.length,
        sources: book.sources.length,
        hidden: book.hiddenCount,
        includeLiving: book.options.includeLiving,
      },
    };
  }
}
