import { decodeGedcomBuffer } from '../gedcom/encoding.js';
import { ValidationError } from '../errors.js';

// Le contenu arrive soit en texte déjà décodé (`gedcom`), soit en octets bruts
// (`gedcomBase64`) : ce dernier cas permet d'ouvrir un fichier ANSEL, ANSI ou
// UTF-16 sans le corrompre, l'encodage étant lu dans le fichier lui-même.
const MAX_GEDCOM_BASE64 = Math.ceil((200 * 1024 * 1024 * 4) / 3);

function readInput(body) {
  if (typeof body?.gedcomBase64 === 'string') {
    if (body.gedcomBase64.length > MAX_GEDCOM_BASE64) {
      throw new ValidationError('Fichier GEDCOM trop volumineux');
    }
    return decodeGedcomBuffer(Buffer.from(body.gedcomBase64, 'base64'));
  }
  return { text: body?.gedcom, encoding: 'UTF-8' };
}

export function createGedcomController(services) {
  const { gedcom } = services;

  return {
    preview(request, response) {
      const { text, encoding } = readInput(request.body);
      response.json({ ...gedcom.preview(text), encoding });
    },

    async import(request, response, next) {
      try {
        const { text, encoding } = readInput(request.body);
        const report = await gedcom.importSafely(text, { performedBy: request.performedBy });
        response.status(report.imported ? 201 : 422).json({ ...report, encoding });
      } catch (error) {
        next(error);
      }
    },

    export(request, response) {
      response.json(gedcom.export(request.body ?? {}));
    },

    async exportArchive(request, response, next) {
      try {
        response.json(await gedcom.exportArchive(request.body ?? {}));
      } catch (error) {
        next(error);
      }
    },

    async importArchive(request, response, next) {
      try {
        const report = await gedcom.importArchive(request.body?.contentBase64, {
          performedBy: request.performedBy,
        });
        response.status(report.imported ? 201 : 422).json(report);
      } catch (error) {
        next(error);
      }
    },
  };
}
