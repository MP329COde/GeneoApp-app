import { ValidationError } from '../errors.js';
import { assertId } from '../validation/schemas.js';

const AUDITABLE_TABLES = [
  'persons',
  'places',
  'events',
  'event_participants',
  'unions',
  'union_partners',
  'parentages',
  'sources',
  'citations',
  'media',
  'database',
  'accounts',
];

export class AuditService {
  constructor(repository) {
    this.repository = repository;
  }

  listForEntity(tableName, rowId) {
    if (!AUDITABLE_TABLES.includes(tableName)) {
      throw new ValidationError(`tableName invalide : ${tableName}`);
    }
    assertId(rowId, 'rowId');
    return this.repository.findForEntity(tableName, rowId);
  }
}

export { AUDITABLE_TABLES };
