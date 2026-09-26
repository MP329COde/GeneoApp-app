import { createHash } from 'node:crypto';
import { NotFoundError, PayloadTooLargeError, ValidationError } from '../errors.js';
import { ocrImage, pdfContent } from '../indexing/content-extract.js';
import { transcribe } from '../paleography/modernize.js';

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const ENTITY_TYPES = new Set(['PERSON', 'EVENT', 'UNION', 'PARENTAGE', 'SOURCE']);

function positiveId(value, field) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ValidationError(`${field} invalide`, { fields: { [field]: 'invalide' } });
  }
  return id;
}

function decodeBase64(value, field = 'contentBase64') {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ValidationError(`${field} est obligatoire`, { fields: { [field]: 'obligatoire' } });
  }
  const clean = value.replace(/^data:[^,]*,/, '');
  if (clean.length > Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 4) {
    throw new PayloadTooLargeError('Image trop volumineuse');
  }
  return Buffer.from(clean, 'base64');
}

function normalizeName(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

function personLabel(person) {
  return `${person.given_names ?? ''} ${person.family_name ?? ''}`.trim();
}

/**
 * Documents et images reliés à l'arbre : déchiffrage des écritures anciennes,
 * « à qui appartient ce fichier ? », rattachement à une fiche et portrait.
 * Tout reste local ; l'IA locale (si activée) n'est qu'une aide facultative.
 */
export class DocumentService {
  constructor(database, { media, localAi = null, ocr = ocrImage } = {}) {
    this.database = database;
    this.media = media;
    this.localAi = localAi;
    this.ocr = ocr;
  }

  requireMedia(mediaId) {
    const media = this.database
      .prepare('SELECT * FROM media WHERE id = ? AND deleted_at IS NULL')
      .get(positiveId(mediaId, 'mediaId'));
    if (!media) throw new NotFoundError('Média introuvable');
    return media;
  }

  requirePerson(personId) {
    const person = this.database
      .prepare('SELECT * FROM persons WHERE id = ? AND deleted_at IS NULL')
      .get(positiveId(personId, 'personId'));
    if (!person) throw new NotFoundError('Personne introuvable');
    return person;
  }

  /**
   * Déchiffre un document ancien. `imageBase64` (facultatif) est la version
   * améliorée de l'image préparée à l'écran (contraste, seuil, agrandissement) ;
   * sinon le texte OCR déjà connu est repris ou recalculé.
   */
  async decode(mediaId, { imageBase64, useAi = false, save = true } = {}) {
    const media = this.requireMedia(mediaId);
    let text;
    if (imageBase64) {
      text = await this.ocr(decodeBase64(imageBase64, 'imageBase64'));
    } else if (media.ocr_text) {
      text = media.ocr_text;
    } else if (media.mime_type.startsWith('image/')) {
      const { content } = await this.media.download(media.id);
      text = await this.ocr(content);
    } else {
      text = '';
    }
    const result = { mediaId: media.id, ...transcribe(text), ai: null };

    if (useAi && this.localAi?.enabled && result.raw) {
      try {
        const { response, model } = await this.localAi.analyze({
          prompt:
            'Voici la lecture automatique (imparfaite) d’un acte ancien français ' +
            '(registre paroissial, XVIe-XVIIIe siècle). Corrige les erreurs de lecture, ' +
            'développe les abréviations et réécris-le en français moderne. ' +
            'N’invente rien : marque [illisible] ce qui ne peut pas être déduit.\n\n' +
            result.raw,
        });
        result.ai = { model, text: response.trim() };
      } catch (error) {
        result.ai = { error: error.message };
      }
    }

    if (save) {
      this.database
        .prepare(
          `UPDATE media SET transcription = ?, transcription_modern = ?,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
        )
        .run(result.raw || null, result.ai?.text || result.modern || null, media.id);
    }
    result.suggestions = this.suggestPersons([
      ...result.clues.names,
      media.original_filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '),
    ]);
    return result;
  }

  /** Enregistre une transcription corrigée à la main. */
  saveTranscription(mediaId, { raw, modern } = {}) {
    const media = this.requireMedia(mediaId);
    for (const [field, value] of Object.entries({ raw, modern })) {
      if (value !== undefined && value !== null && typeof value !== 'string') {
        throw new ValidationError(`${field} invalide`, { fields: { [field]: 'invalide' } });
      }
    }
    this.database
      .prepare(
        `UPDATE media SET transcription = COALESCE(?, transcription),
           transcription_modern = COALESCE(?, transcription_modern),
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
      )
      .run(raw ?? null, modern ?? null, media.id);
    return this.requireMedia(media.id);
  }

  /** Personnes de l'arbre dont le nom apparaît dans les textes donnés. */
  suggestPersons(texts, limit = 8) {
    const haystack = normalizeName(texts.filter(Boolean).join(' \n '));
    if (!haystack.trim()) return [];
    const persons = this.database
      .prepare(
        `SELECT id, given_names, family_name, sex, portrait_media_id FROM persons
         WHERE deleted_at IS NULL`,
      )
      .all();
    const scored = [];
    for (const person of persons) {
      const family = normalizeName(person.family_name);
      if (family.length < 3 || !new RegExp(`\\b${family.replace(/\W/g, '.')}\\b`).test(haystack)) {
        continue;
      }
      const given = normalizeName(person.given_names)
        .split(/\s+/)
        .filter((name) => name.length > 2);
      const matchedGiven = given.filter((name) => new RegExp(`\\b${name}\\b`).test(haystack));
      scored.push({
        ...person,
        label: personLabel(person),
        score: 1 + matchedGiven.length * 2,
        reason: matchedGiven.length
          ? 'Prénom et nom trouvés dans le document'
          : 'Nom de famille trouvé dans le document',
      });
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /** Tout ce qui relie un média à l'arbre. */
  owners(mediaId) {
    const media = this.requireMedia(mediaId);
    const links = [];
    const add = (person, reason) => {
      if (person && !links.some((link) => link.id === person.id && link.reason === reason)) {
        links.push({
          id: person.id,
          given_names: person.given_names,
          family_name: person.family_name,
          label: personLabel(person),
          reason,
        });
      }
    };
    const personById = (id) =>
      this.database
        .prepare(
          'SELECT id, given_names, family_name FROM persons WHERE id = ? AND deleted_at IS NULL',
        )
        .get(id);

    if (media.entity_type === 'PERSON') add(personById(media.entity_id), 'Rattaché à la fiche');
    for (const row of this.database
      .prepare(`SELECT id FROM persons WHERE portrait_media_id = ? AND deleted_at IS NULL`)
      .all(media.id)) {
      add(personById(row.id), 'Photo de portrait');
    }
    for (const row of this.database
      .prepare(
        `SELECT person_id FROM media_regions
         WHERE media_id = ? AND person_id IS NOT NULL AND deleted_at IS NULL`,
      )
      .all(media.id)) {
      add(personById(row.person_id), 'Identifié sur la photo');
    }
    const sourceId = media.source_id ?? (media.entity_type === 'SOURCE' ? media.entity_id : null);
    let source = null;
    if (sourceId) {
      source = this.database.prepare('SELECT id, title FROM sources WHERE id = ?').get(sourceId);
      for (const row of this.database
        .prepare(
          `SELECT entity_id FROM citations
           WHERE source_id = ? AND entity_type = 'PERSON' AND deleted_at IS NULL`,
        )
        .all(sourceId)) {
        add(personById(row.entity_id), `Cité dans la source « ${source?.title ?? sourceId} »`);
      }
    }
    const linkedIds = new Set(links.map((link) => link.id));
    const suggestions = this.suggestPersons([
      media.transcription_modern,
      media.transcription,
      media.ocr_text,
      media.description,
      media.original_filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '),
    ]).filter((person) => !linkedIds.has(person.id));
    return { media, source, owners: links, suggestions };
  }

  /**
   * « À qui appartient ce fichier ? » : on dépose n'importe quel fichier. S'il
   * est déjà dans l'application (même empreinte), on donne ses propriétaires ;
   * sinon on le lit (OCR pour les images) et on propose des personnes.
   */
  async identify({ contentBase64, filename = '' } = {}) {
    const buffer = decodeBase64(contentBase64);
    const checksum = createHash('sha256').update(buffer).digest('hex');
    const known = this.database
      .prepare('SELECT id FROM media WHERE checksum_sha256 = ? AND deleted_at IS NULL')
      .all(checksum);
    if (known.length > 0) {
      return {
        known: true,
        matches: known.map((row) => this.owners(row.id)),
        suggestions: [],
        clues: null,
      };
    }
    const isImage = /^(\x89PNG|\xff\xd8\xff|GIF8|RIFF|II\*\0|MM\0\*)/.test(
      buffer.subarray(0, 4).toString('latin1'),
    );
    let text = '';
    if (isImage) {
      try {
        text = await this.ocr(buffer);
      } catch {
        text = '';
      }
    } else if (buffer.subarray(0, 5).toString('latin1') === '%PDF-') {
      try {
        text = (await pdfContent(buffer)).text;
      } catch {
        text = '';
      }
    } else if (!buffer.subarray(0, 512).includes(0)) {
      text = buffer.toString('utf8').slice(0, 200_000);
    }
    const reading = transcribe(text);
    return {
      known: false,
      matches: [],
      text: reading.modern.slice(0, 5_000),
      clues: reading.clues,
      suggestions: this.suggestPersons([
        reading.modern,
        String(filename)
          .replace(/\.[^.]+$/, '')
          .replace(/[_-]+/g, ' '),
      ]),
    };
  }

  /** Rattache un média existant à une fiche (personne, événement, source…). */
  link(mediaId, { entityType, entityId } = {}, { performedBy = null } = {}) {
    const media = this.requireMedia(mediaId);
    if (!ENTITY_TYPES.has(entityType)) {
      throw new ValidationError('entityType invalide', { fields: { entityType: 'invalide' } });
    }
    const id = positiveId(entityId, 'entityId');
    const table = {
      PERSON: 'persons',
      EVENT: 'events',
      UNION: 'unions',
      PARENTAGE: 'parentages',
      SOURCE: 'sources',
    }[entityType];
    if (
      !this.database.prepare(`SELECT 1 FROM ${table} WHERE id = ? AND deleted_at IS NULL`).get(id)
    ) {
      throw new NotFoundError('Fiche introuvable');
    }
    this.database
      .prepare(
        `UPDATE media SET entity_type = ?, entity_id = ?,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
      )
      .run(entityType, id, media.id);
    this.database
      .prepare(
        `INSERT INTO audit_log (table_name, row_id, operation, changes, performed_by)
         VALUES ('media', ?, 'UPDATE', ?, ?)`,
      )
      .run(media.id, JSON.stringify({ entityType, entityId: id }), performedBy);
    return this.requireMedia(media.id);
  }

  /** Définit (ou retire avec `mediaId: null`) la photo de portrait d'une personne. */
  setPortrait(personId, { mediaId } = {}, { performedBy = null } = {}) {
    const person = this.requirePerson(personId);
    let value = null;
    if (mediaId !== null && mediaId !== undefined && mediaId !== '') {
      const media = this.requireMedia(mediaId);
      if (!media.mime_type.startsWith('image/')) {
        throw new ValidationError('Le portrait doit être une image');
      }
      value = media.id;
    }
    this.database
      .prepare(
        `UPDATE persons SET portrait_media_id = ?,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
      )
      .run(value, person.id);
    this.database
      .prepare(
        `INSERT INTO audit_log (table_name, row_id, operation, changes, performed_by)
         VALUES ('persons', ?, 'UPDATE', ?, ?)`,
      )
      .run(person.id, JSON.stringify({ portraitMediaId: value }), performedBy);
    return this.requirePerson(person.id);
  }

  /** Envoie une photo et en fait directement le portrait de la personne. */
  async uploadPortrait(personId, { filename, contentBase64 } = {}, options = {}) {
    const person = this.requirePerson(personId);
    const media = await this.media.upload(
      { filename, contentBase64, entityType: 'PERSON', entityId: person.id },
      options,
    );
    return this.setPortrait(person.id, { mediaId: media.id }, options);
  }
}
