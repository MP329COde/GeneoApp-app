import { NotFoundError, PayloadTooLargeError } from '../errors.js';
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

    if (data.sourceId !== null && this.sourceRepository) {
      const source = this.sourceRepository.findById(data.sourceId);
      if (!source) throw new NotFoundError(`Source introuvable : ${data.sourceId}`);
    }

    // Borne la taille de la chaîne base64 avant décodage pour éviter
    // d'allouer une mémoire disproportionnée sur une charge malveillante.
    const maxBase64Length = Math.ceil((this.storage.maxBytes * 4) / 3) + 4;
    if (data.contentBase64.length > maxBase64Length) {
      throw new PayloadTooLargeError('Contenu encodé trop volumineux');
    }

    const buffer = Buffer.from(data.contentBase64, 'base64');
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
