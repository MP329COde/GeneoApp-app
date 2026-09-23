import { PhotoService } from './photo.service.js';
import { UndoHistory } from '../../../db/src/history/undo-history.js';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  PersonRepository,
  PlaceRepository,
  EventRepository,
  UnionRepository,
  ParentageRepository,
  SourceRepository,
  MediaRepository,
  PhotoRepository,
  SearchRepository,
  AuditRepository,
  AccountRepository,
  TrashRepository,
  NoteRepository,
  ResearchRepository,
} from '../../../db/src/index.js';
import { PersonService } from './person.service.js';
import { PlaceService } from './place.service.js';
import { EventService } from './event.service.js';
import { UnionService } from './union.service.js';
import { ParentageService } from './parentage.service.js';
import { SourceService } from './source.service.js';
import { MediaService } from './media.service.js';
import { SearchService } from './search.service.js';
import { AuditService } from './audit.service.js';
import { AccountService } from './account.service.js';
import { SessionStore } from './session-store.js';
import { TrashService } from './trash.service.js';
import { BackupService } from './backup.service.js';
import { GedcomService } from '../gedcom/service.js';
import { MediaStorage } from '../media/storage.js';
import { OcrService } from '../ocr/service.js';
import { GenealogyGraphService } from './genealogy-graph.service.js';
import { NoteService } from './note.service.js';
import { ResearchService } from './research.service.js';
import { StatisticsService } from './statistics.service.js';
import { LocalAiService } from './local-ai.service.js';
import { MergeService } from './merge.service.js';

const DEFAULT_MEDIA_ROOT = process.env.GENEOAPP_MEDIA_DIR ?? path.join(tmpdir(), 'geneoapp-media');
export const DEFAULT_BACKUP_DIR =
  process.env.GENEOAPP_BACKUP_DIR ?? path.join(tmpdir(), 'geneoapp-backups');

export function createServices(
  database,
  { mediaRoot = DEFAULT_MEDIA_ROOT, backupDir = DEFAULT_BACKUP_DIR, mirrorDir = () => null } = {},
) {
  const sources = new SourceService(new SourceRepository(database));
  const entityServices = {
    persons: new PersonService(new PersonRepository(database)),
    places: new PlaceService(new PlaceRepository(database)),
    events: new EventService(new EventRepository(database)),
    unions: new UnionService(new UnionRepository(database)),
    parentages: new ParentageService(new ParentageRepository(database)),
    media: new MediaService(
      new MediaRepository(database),
      new MediaStorage(mediaRoot),
      new OcrService(),
      { sourceRepository: sources.repository },
    ),
  };

  const accounts = new AccountService(new AccountRepository(database), new SessionStore());
  const backups = new BackupService(database, { backupDir, mirrorDir });

  return {
    ...entityServices,
    sources,
    search: new SearchService(new SearchRepository(database), database),
    audit: new AuditService(new AuditRepository(database)),
    gedcom: new GedcomService(database, { media: entityServices.media, backups }),
    accounts,
    trash: new TrashService(new TrashRepository(database), entityServices),
    backups,
    graph: new GenealogyGraphService(database),
    notes: new NoteService(new NoteRepository(database)),
    research: new ResearchService(new ResearchRepository(database)),
    statistics: new StatisticsService(database),
    localAi: new LocalAiService(),
    merge: new MergeService(database),
    history: new UndoHistory(database),
    photos: new PhotoService(new PhotoRepository(database), database),
  };
}
