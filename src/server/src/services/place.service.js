import { ConflictError, NotFoundError, ValidationError } from '../errors.js';
import {
  assertId,
  validatePlaceCreate,
  validatePlaceName,
  validatePlaceParent,
  validatePlaceUpdate,
} from '../validation/schemas.js';
import { findCommunesByName } from '../geo/communes-fr.js';

export class PlaceService {
  constructor(repository) {
    this.repository = repository;
  }

  /**
   * Propose un placement automatique pour chaque lieu sans coordonnées, en
   * cherchant une commune française de même nom dans le référentiel
   * embarqué (aucun appel réseau). Purement une prévisualisation : aucune
   * écriture ; la confirmation explicite se fait via `applyAutoLocate`.
   */
  previewAutoLocate() {
    const unlocated = this.repository
      .list()
      .filter((place) => place.latitude === null || place.longitude === null);

    return unlocated.map((place) => {
      const matches = findCommunesByName(place.name);
      return {
        placeId: place.id,
        name: place.name,
        status: matches.length === 0 ? 'none' : matches.length === 1 ? 'unique' : 'ambiguous',
        matches,
      };
    });
  }

  /**
   * Applique un placement automatique confirmé par l'utilisateur : chaque
   * assignation désigne un lieu et le code INSEE de la commune choisie
   * (obligatoire dès qu'il y a plusieurs homonymes, voir `previewAutoLocate`).
   * Le code est revérifié côté serveur contre le référentiel (jamais les
   * coordonnées brutes envoyées par le client).
   */
  applyAutoLocate(assignments = []) {
    if (!Array.isArray(assignments) || assignments.length === 0) {
      throw new ValidationError('assignments doit être un tableau non vide');
    }
    const updated = [];
    for (const assignment of assignments) {
      const placeId = Number(assignment?.placeId);
      const code = String(assignment?.code ?? '');
      if (!Number.isInteger(placeId) || !code) {
        throw new ValidationError('Chaque assignation requiert placeId et code');
      }
      const place = this.repository.findById(placeId);
      if (!place) throw new NotFoundError(`Lieu introuvable : ${placeId}`);

      const commune = findCommunesByName(place.name).find((candidate) => candidate.code === code);
      if (!commune) {
        throw new ValidationError(
          `Le code ${code} ne correspond à aucune commune nommée « ${place.name} »`,
        );
      }
      updated.push(
        this.repository.updateCoordinates(placeId, {
          latitude: commune.latitude,
          longitude: commune.longitude,
        }),
      );
    }
    return updated;
  }

  create(payload, options) {
    const data = validatePlaceCreate(payload);
    return this.repository.create(data, options);
  }

  get(id) {
    assertId(id);
    const place = this.repository.findById(id);
    if (!place) throw new NotFoundError(`Lieu introuvable : ${id}`);
    return place;
  }

  list(options) {
    return this.repository.list(options);
  }

  update(id, payload, options) {
    this.get(id);
    return this.repository.update(id, validatePlaceUpdate(payload), options);
  }

  listNames(placeId) {
    this.get(placeId);
    return this.repository.listNames(placeId);
  }

  addName(placeId, payload, options) {
    this.get(placeId);
    return this.repository.addName(placeId, validatePlaceName(payload), options);
  }

  removeName(placeId, nameId, options) {
    this.get(placeId);
    assertId(nameId, 'nameId');
    if (!this.repository.removeName(placeId, nameId, options)) {
      throw new NotFoundError(`Nom de lieu introuvable : ${nameId}`);
    }
  }

  listParents(placeId) {
    this.get(placeId);
    return this.repository.listParents(placeId);
  }

  addParent(placeId, payload, options) {
    this.get(placeId);
    const data = validatePlaceParent(payload);
    if (data.parentPlaceId === placeId) {
      throw new ValidationError('Un lieu ne peut pas être son propre parent');
    }
    this.get(data.parentPlaceId);
    try {
      return this.repository.addParent(placeId, data, options);
    } catch (error) {
      // Cycle ou chevauchement de période : conflit métier, pas une erreur serveur.
      throw new ConflictError(error.message);
    }
  }

  removeParent(placeId, parentLinkId, options) {
    this.get(placeId);
    assertId(parentLinkId, 'parentLinkId');
    if (!this.repository.removeParent(placeId, parentLinkId, options)) {
      throw new NotFoundError(`Rattachement introuvable : ${parentLinkId}`);
    }
  }

  /** Nom et hiérarchie d'un lieu à une date (année) donnée, ou aujourd'hui sans année. */
  resolve(placeId, year) {
    this.get(placeId);
    let resolvedYear = null;
    if (year !== undefined && year !== null && year !== '') {
      resolvedYear = Number(year);
      if (!Number.isInteger(resolvedYear)) {
        throw new ValidationError('year doit être une année entière');
      }
    }
    return this.repository.resolveAt(placeId, resolvedYear);
  }

  remove(id, options) {
    assertId(id);
    const existing = this.repository.findById(id);
    if (!existing) throw new NotFoundError(`Lieu introuvable : ${id}`);
    return this.repository.softDelete(id, options);
  }

  restore(id, options) {
    assertId(id);
    const existing = this.repository.findById(id, { includeDeleted: true });
    if (!existing || existing.deleted_at === null) {
      throw new NotFoundError(`Lieu non supprimé ou introuvable : ${id}`);
    }
    return this.repository.restore(id, options);
  }
}
