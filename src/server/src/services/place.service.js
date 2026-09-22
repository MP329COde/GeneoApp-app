import { NotFoundError } from '../errors.js';
import { assertId, validatePlaceCreate } from '../validation/schemas.js';

export class PlaceService {
  constructor(repository) {
    this.repository = repository;
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
