import { NotFoundError, ValidationError } from '../errors.js';

const MAX_TAGS = 30;
const MAX_TAG_LENGTH = 40;
const MAX_TEXT = 5_000;

function invalid(field, message = `${field} invalide`) {
  return new ValidationError(message, { fields: { [field]: 'invalide' } });
}

function positiveId(value, field) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw invalid(field);
  return id;
}

function ratio(value, field, { allowZero = true } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1 || (!allowZero && number === 0)) {
    throw invalid(field, `${field} doit être compris entre 0 et 1`);
  }
  return Math.round(number * 10_000) / 10_000;
}

function normalizeTags(tags) {
  if (tags === undefined) return undefined;
  if (tags === null) return null;
  const list = Array.isArray(tags) ? tags : String(tags).split(',');
  const cleaned = [...new Set(list.map((tag) => String(tag).trim()).filter(Boolean))];
  if (cleaned.length > MAX_TAGS || cleaned.some((tag) => tag.length > MAX_TAG_LENGTH)) {
    throw invalid('tags', `Au plus ${MAX_TAGS} tags de ${MAX_TAG_LENGTH} caractères`);
  }
  return cleaned.length ? cleaned.join(', ') : null;
}

/**
 * Photos : métadonnées et reconnaissance manuelle des personnes présentes.
 * Aucune détection automatique : c'est l'utilisateur qui trace la zone et
 * dit « c'est Jean Dupont » (données locales, pas de biométrie).
 */
export class PhotoService {
  constructor(repository, database) {
    this.repository = repository;
    this.database = database;
  }

  requireMedia(mediaId) {
    const media = this.repository.findMedia(positiveId(mediaId, 'mediaId'));
    if (!media) throw new NotFoundError('Média introuvable');
    return media;
  }

  get(mediaId) {
    const media = this.requireMedia(mediaId);
    const place = media.place_id
      ? this.database.prepare('SELECT id, name FROM places WHERE id = ?').get(media.place_id)
      : null;
    return { ...media, place, regions: this.repository.listRegions(media.id) };
  }

  updateMetadata(mediaId, payload, options) {
    const media = this.requireMedia(mediaId);
    const data = payload ?? {};
    const patch = {};
    if (data.takenDate !== undefined) {
      if (
        data.takenDate !== null &&
        (typeof data.takenDate !== 'string' || data.takenDate.length > 100)
      ) {
        throw invalid('takenDate');
      }
      patch.takenDate = data.takenDate?.trim() || null;
    }
    if (data.placeId !== undefined) {
      patch.placeId =
        data.placeId === null || data.placeId === '' ? null : positiveId(data.placeId, 'placeId');
      if (
        patch.placeId !== null &&
        !this.database
          .prepare('SELECT 1 FROM places WHERE id = ? AND deleted_at IS NULL')
          .get(patch.placeId)
      ) {
        throw new NotFoundError('Lieu introuvable');
      }
    }
    if (data.description !== undefined) {
      if (
        data.description !== null &&
        (typeof data.description !== 'string' || data.description.length > MAX_TEXT)
      ) {
        throw invalid('description');
      }
      patch.description = data.description?.trim() || null;
    }
    const tags = normalizeTags(data.tags);
    if (tags !== undefined) patch.tags = tags;
    this.repository.updateMetadata(media.id, patch, options);
    return this.get(media.id);
  }

  addRegion(mediaId, payload, options) {
    const media = this.requireMedia(mediaId);
    if (!media.mime_type.startsWith('image/')) {
      throw new ValidationError('Les zones de personnes ne s’appliquent qu’aux images');
    }
    const data = payload ?? {};
    const personId =
      data.personId === undefined || data.personId === null
        ? null
        : positiveId(data.personId, 'personId');
    if (
      personId !== null &&
      !this.database
        .prepare('SELECT 1 FROM persons WHERE id = ? AND deleted_at IS NULL')
        .get(personId)
    ) {
      throw new NotFoundError('Personne introuvable');
    }
    const label =
      typeof data.label === 'string' && data.label.trim() ? data.label.trim().slice(0, 120) : null;
    if (personId === null && label === null) {
      throw new ValidationError('Indiquez une personne ou un libellé pour la zone', {
        fields: { personId: 'obligatoire' },
      });
    }
    const x = ratio(data.x, 'x');
    const y = ratio(data.y, 'y');
    const width = ratio(data.width, 'width', { allowZero: false });
    const height = ratio(data.height, 'height', { allowZero: false });
    if (x + width > 1.0001 || y + height > 1.0001) {
      throw new ValidationError('La zone dépasse de la photo');
    }
    return this.repository.addRegion(media.id, { personId, label, x, y, width, height }, options);
  }

  removeRegion(regionId, options) {
    if (!this.repository.removeRegion(positiveId(regionId, 'regionId'), options)) {
      throw new NotFoundError('Zone introuvable');
    }
  }

  listForPerson(personId) {
    return this.repository.listForPerson(positiveId(personId, 'personId'));
  }
}
