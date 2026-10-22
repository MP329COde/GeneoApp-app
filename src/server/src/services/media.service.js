import { NotFoundError, PayloadTooLargeError } from '../errors.js';
import { officeText } from '../indexing/content-extract.js';
import { decodeGedcomBuffer } from '../gedcom/encoding.js';
import { validateMediaUpload, assertId } from '../validation/schemas.js';

export class MediaService {
  constructor(repository, storage, ocrService, { sourceRepository } = {}) {
    this.repository = repository;
    this.storage = storage;
    this.ocrService = ocrService;
    this.sourceRepository = sourceRepository ?? null;
  }

  async upload(payload, options = {}) {
    const data = validateMediaUpload(payload);

    this.#checkTargets(data);

    // Borne la taille de la chaîne base64 avant décodage pour éviter
    // d'allouer une mémoire disproportionnée sur une charge malveillante.
    // (Le plafond exact dépend du type réel, vérifié au stockage.)
    const maxBase64Length = Math.ceil((this.storage.hardLimit * 4) / 3) + 4;
    if (data.contentBase64.length > maxBase64Length) {
      throw new PayloadTooLargeError('Contenu encodé trop volumineux');
    }

    return this.uploadBuffer(Buffer.from(data.contentBase64, 'base64'), data, options);
  }

  /**
   * Enregistre un fichier déjà décodé (corps binaire brut ou JSON/base64). Le
   * type, la taille maximale de la catégorie et le contenu sont vérifiés à
   * partir des octets eux-mêmes.
   */
  async uploadBuffer(buffer, data, options = {}) {
    const stored = await this.storage.save(buffer);

    const media = this.repository.create(
      {
        sourceId: data.sourceId,
        entityType: data.entityType,
        entityId: data.entityId,
        originalFilename: data.filename,
        storedFilename: stored.storedFilename,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
        checksumSha256: stored.checksumSha256,
        notes: data.notes,
      },
      options,
    );

    // Texte brut et documents Word : le texte est lu directement (aucune
    // reconnaissance de caractères nécessaire) et rendu recherchable.
    const direct = this.#directText(buffer, stored.mimeType);
    if (direct !== null) {
      return this.repository.recordOcrResult(media.id, { status: 'DONE', text: direct }, options);
    }

    if (this.ocrService.isEligible(media.mime_type)) {
      const absolutePath = this.storage.resolveSafePath(media.stored_filename);
      const result = await this.ocrService.run(absolutePath, media.mime_type);
      return this.repository.recordOcrResult(media.id, result, options);
    }

    return this.repository.recordOcrResult(
      media.id,
      { status: 'UNAVAILABLE', text: null },
      options,
    );
  }

  #checkTargets(data) {
    if (data.sourceId !== null && this.sourceRepository) {
      const source = this.sourceRepository.findById(data.sourceId);
      if (!source) throw new NotFoundError(`Source introuvable : ${data.sourceId}`);
    }
    this.#assertTarget(data.entityType, data.entityId);
  }

  /** Envoi d'un fichier en octets bruts (sans surcoût base64) : audio et vidéo volumineux. */
  async uploadRaw(buffer, metadata, options = {}) {
    this.#checkTargets(metadata);
    return this.uploadBuffer(buffer, metadata, options);
  }

  #directText(buffer, mimeType) {
    try {
      if (mimeType === 'text/plain')
        return decodeGedcomBuffer(buffer).text.trim().slice(0, 200_000);
      if (mimeType.includes('wordprocessingml')) return officeText(buffer).slice(0, 200_000);
    } catch {
      // Extraction impossible : le fichier reste stocké, sans texte indexé.
    }
    return null;
  }

  // La cible d'un média est une référence polymorphe sans clé étrangère : elle
  // doit exister, sinon le fichier serait rattaché à une fiche fantôme.
  #assertTarget(entityType, entityId) {
    if (entityType === null || entityType === undefined) return;
    const table = {
      PERSON: 'persons',
      EVENT: 'events',
      UNION: 'unions',
      PARENTAGE: 'parentages',
      SOURCE: 'sources',
    }[entityType];
    const exists = this.repository.database
      .prepare(`SELECT 1 FROM ${table} WHERE id = ? AND deleted_at IS NULL`)
      .get(entityId);
    if (!exists) throw new NotFoundError(`Cible introuvable : ${entityType}#${entityId}`);
  }

  get(id) {
    assertId(id);
    const media = this.repository.findById(id);
    if (!media) throw new NotFoundError(`Média introuvable : ${id}`);
    return media;
  }

  listForSource(sourceId) {
    assertId(sourceId, 'sourceId');
    return this.repository.findBySource(sourceId);
  }

  listForEntity(entityType, entityId) {
    assertId(entityId, 'entityId');
    return this.repository.findForEntity(entityType, entityId);
  }

  async download(id) {
    const media = this.get(id);
    const content = await this.storage.read(media.stored_filename);
    return { media, content };
  }

  remove(id, options = {}) {
    assertId(id);
    const media = this.repository.findById(id);
    if (!media) throw new NotFoundError(`Média introuvable : ${id}`);
    // Le fichier n'est jamais supprimé du disque ici : seule la ligne de
    // métadonnées est marquée supprimée, afin de préserver la preuve
    // matérielle même après suppression logique côté application.
    return this.repository.softDelete(id, options);
  }

  restore(id, options = {}) {
    assertId(id);
    const existing = this.repository.findById(id, { includeDeleted: true });
    if (!existing || existing.deleted_at === null) {
      throw new NotFoundError(`Média non supprimé ou introuvable : ${id}`);
    }
    return this.repository.restore(id, options);
  }
}
