export { openDatabase } from './database.js';
export { runMigrations } from './migrate.js';
export { UndoHistory, installUndoTriggers } from './history/undo-history.js';
export { PersonRepository } from './repositories/person-repository.js';
export { NoteRepository } from './repositories/note-repository.js';
export { ResearchRepository } from './repositories/research-repository.js';
export { PlaceRepository } from './repositories/place-repository.js';
export { EventRepository } from './repositories/event-repository.js';
export { UnionRepository } from './repositories/union-repository.js';
export { ParentageRepository } from './repositories/parentage-repository.js';
export { SourceRepository } from './repositories/source-repository.js';
export { PhotoRepository } from './repositories/photo-repository.js';
export { MediaRepository } from './repositories/media-repository.js';
export { SearchRepository } from './repositories/search-repository.js';
export { AuditRepository } from './repositories/audit-repository.js';
export { AccountRepository } from './repositories/account-repository.js';
export { TrashRepository, TRASH_TABLE_NAMES } from './repositories/trash-repository.js';
export {
  exportDatabaseToJson,
  importDatabaseFromJson,
  EXPORTABLE_TABLES,
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
} from './backup/data-export.js';
export {
  createSqliteFileBackup,
  writeJsonFileBackup,
  listBackups,
  verifyBackup,
  restoreSqliteFileBackup,
  sha256File,
} from './backup/backup-file.js';
