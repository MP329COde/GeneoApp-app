import { randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { sniffMimeType } from './mime-sniffer.js';
import { PayloadTooLargeError, UnsupportedMediaTypeError } from '../errors.js';

const DEFAULT_MAX_BYTES = 25 * 1024 * 1024; // 25 Mo : images, PDF, texte, Word

// Limites par catégorie, multiples de la limite des documents : un enregistrement
// audio ou une vidéo de famille est naturellement plus gros qu'un acte scanné.
const CATEGORY_FACTORS = { document: 1, audio: 4, video: 8 };

/**
 * Stockage de fichiers médias sur disque, hors de la base de données.
 *
 * Sécurité :
 * - le type réel du fichier est déterminé par ses octets (sniffMimeType),
 *   jamais par le nom ou le Content-Type fournis par l'appelant ;
 * - le nom de fichier sur disque est toujours généré côté serveur
 *   (UUID + extension déduite du type détecté), jamais dérivé du nom
 *   original fourni par l'utilisateur, ce qui élimine toute traversée de
 *   chemin (`../`, chemins absolus, séparateurs encodés...) ;
 * - toute résolution de chemin est vérifiée après coup comme filet de
 *   sécurité supplémentaire, même si l'entrée ne peut normalement pas en
 *   sortir.
 */
export class MediaStorage {
  constructor(rootDir, { maxBytes = DEFAULT_MAX_BYTES } = {}) {
    this.rootDir = path.resolve(rootDir);
    this.maxBytes = maxBytes;
  }

  async init() {
    await mkdir(this.rootDir, { recursive: true });
  }

  resolveSafePath(storedFilename) {
    if (typeof storedFilename !== 'string' || /[\\/]/.test(storedFilename)) {
      throw new Error('Nom de fichier stocké invalide');
    }
    const resolved = path.resolve(this.rootDir, storedFilename);
    const rootWithSep = this.rootDir.endsWith(path.sep) ? this.rootDir : this.rootDir + path.sep;
    if (!resolved.startsWith(rootWithSep)) {
      throw new Error('Chemin résolu hors du répertoire de stockage des médias');
    }
    return resolved;
  }

  /** Taille maximale d'une catégorie de fichier (documents, audio, vidéo). */
  limitFor(category) {
    return this.maxBytes * (CATEGORY_FACTORS[category] ?? 1);
  }

  /** Plafond absolu, avant même d'analyser le contenu. */
  get hardLimit() {
    return this.limitFor('video');
  }

  async save(buffer) {
    // Plafond absolu avant toute analyse : pas de lecture d'un contenu démesuré.
    if (buffer.length > this.hardLimit) {
      throw new PayloadTooLargeError(
        `Fichier trop volumineux (${buffer.length} octets, maximum ${this.hardLimit})`,
      );
    }

    const detected = sniffMimeType(buffer);
    if (!detected) {
      throw new UnsupportedMediaTypeError(
        'Type de fichier non reconnu ou non autorisé (contenu vérifié par signature binaire)',
      );
    }
    // Limite propre au type réellement détecté (jamais au type déclaré).
    const limit = this.limitFor(detected.category);
    if (buffer.length > limit) {
      throw new PayloadTooLargeError(
        `Fichier trop volumineux (${buffer.length} octets, maximum ${limit} pour ce type)`,
      );
    }

    await this.init();

    const storedFilename = `${randomUUID()}${detected.extension}`;
    const absolutePath = this.resolveSafePath(storedFilename);
    const checksumSha256 = createHash('sha256').update(buffer).digest('hex');

    await writeFile(absolutePath, buffer, { flag: 'wx' });

    return {
      storedFilename,
      mimeType: detected.mimeType,
      sizeBytes: buffer.length,
      checksumSha256,
    };
  }

  async read(storedFilename) {
    return readFile(this.resolveSafePath(storedFilename));
  }

  async exists(storedFilename) {
    try {
      await stat(this.resolveSafePath(storedFilename));
      return true;
    } catch {
      return false;
    }
  }
}
