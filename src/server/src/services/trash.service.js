import { ValidationError } from '../errors.js';
import { assertId } from '../validation/schemas.js';

const RESTORE_SERVICE_BY_TABLE = {
  persons: 'persons',
  places: 'places',
  events: 'events',
  unions: 'unions',
  parentages: 'parentages',
  media: 'media',
  assertions: 'assertions',
  // Le carnet de recherche est supprimé logiquement : il doit donc être
  // restaurable depuis la corbeille, comme les autres tables métier.
  research_notebook: 'research',
};

export class TrashService {
  constructor(repository, services) {
    this.repository = repository;
    this.services = services;
  }

  list() {
    return this.repository.list();
  }

  restore(table, id, options) {
    const key = RESTORE_SERVICE_BY_TABLE[table];
    if (!key) throw new ValidationError(`Table de corbeille invalide : ${table}`);
    assertId(id);
    return this.services[key].restore(id, options);
  }

  purge(table, id, options) {
    if (!RESTORE_SERVICE_BY_TABLE[table]) {
      throw new ValidationError(`Table de corbeille invalide : ${table}`);
    }
    assertId(id);
    return this.repository.purge(table, id, options);
  }
}
