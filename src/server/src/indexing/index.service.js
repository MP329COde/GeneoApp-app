import { stat } from 'node:fs/promises';
import path from 'node:path';
import { ConflictError, NotFoundError, ValidationError } from '../errors.js';
import { IndexRepository } from './index-repository.js';
import { scanFolder } from './folder-scanner.js';
import { crawlSite, validateStartUrl } from './crawler.js';

function toFtsQuery(query) {
  const terms = String(query)
    .normalize('NFC')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, 12);
  return terms.map((term) => `"${term}"*`).join(' ');
}

function boundedInteger(value, field, min, max, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new ValidationError(`${field} doit être compris entre ${min} et ${max}`, {
      fields: { [field]: 'invalide' },
    });
  }
  return number;
}

/**
 * Indexation de documents (ADR 0011) : dossiers locaux et sites listés,
 * recherche plein texte, réglages de planification et journal.
 */
export class IndexService {
  constructor(database, { media = null, ocr = null, fetchImpl = fetch, crawlLimits } = {}) {
    this.repository = new IndexRepository(database);
    this.media = media;
    this.ocr = ocr;
    this.fetchImpl = fetchImpl;
    this.crawlLimits = crawlLimits;
    this.running = null;
  }

  listSources() {
    return this.repository.listSources();
  }

  async addSource(payload = {}) {
    const kind = payload.kind;
    if (!['FOLDER', 'SITE'].includes(kind)) {
      throw new ValidationError('Type de source invalide', { fields: { kind: 'invalide' } });
    }
    let location = typeof payload.location === 'string' ? payload.location.trim() : '';
    if (kind === 'FOLDER') {
      if (!path.isAbsolute(location)) {
        throw new ValidationError('Le dossier doit être un chemin absolu', {
          fields: { location: 'invalide' },
        });
      }
      location = path.resolve(location);
      const info = await stat(location).catch(() => null);
      if (!info?.isDirectory()) {
        throw new ValidationError('Dossier introuvable', { fields: { location: 'introuvable' } });
      }
    } else {
      const url = validateStartUrl(location);
      if (!url) {
        throw new ValidationError('Adresse http(s) invalide ou avec identifiants', {
          fields: { location: 'invalide' },
        });
      }
      location = url.href;
    }
    const label =
      typeof payload.label === 'string' && payload.label.trim()
        ? payload.label.trim().slice(0, 120)
        : kind === 'FOLDER'
          ? path.basename(location)
          : new URL(location).host;
    return this.repository.createSource({
      kind,
      label,
      location,
      maxDepth: boundedInteger(payload.maxDepth, 'maxDepth', 0, 10, kind === 'FOLDER' ? 5 : 2),
      maxDocuments: boundedInteger(
        payload.maxDocuments,
        'maxDocuments',
        1,
        5000,
        kind === 'FOLDER' ? 1000 : 100,
      ),
    });
  }

  setSourceEnabled(id, enabled) {
    if (!this.repository.findSource(Number(id))) throw new NotFoundError('Source introuvable');
    return this.repository.updateSource(Number(id), { enabled: Boolean(enabled) });
  }

  removeSource(id) {
    if (!this.repository.removeSource(Number(id))) throw new NotFoundError('Source introuvable');
  }

  getSettings() {
    return this.repository.getSettings();
  }

  updateSettings(payload = {}) {
    return this.repository.updateSettings({
      scheduleEnabled:
        payload.scheduleEnabled === undefined ? undefined : Boolean(payload.scheduleEnabled),
      scheduleHour:
        payload.scheduleHour === undefined
          ? undefined
          : boundedInteger(payload.scheduleHour, 'scheduleHour', 0, 23, 2),
      networkAllowed:
        payload.networkAllowed === undefined ? undefined : Boolean(payload.networkAllowed),
    });
  }

  search(query, limit = 50) {
    const fts = toFtsQuery(query ?? '');
    if (!fts) return [];
    return this.repository.search(fts, Math.min(Math.max(Number(limit) || 50, 1), 200));
  }

  listRuns(limit) {
    return this.repository.listRuns(limit);
  }

  status() {
    return {
      running: Boolean(this.running),
      settings: this.getSettings(),
      sources: this.listSources(),
      runs: this.listRuns(10),
    };
  }

  /** Lance une indexation complète ; une seule à la fois. */
  async run(trigger = 'MANUAL') {
    if (this.running) throw new ConflictError('Une indexation est déjà en cours');
    const runId = this.repository.startRun(trigger);
    const counts = { indexed: 0, unchanged: 0, skipped: 0, errors: 0 };
    const notes = [];
    this.running = (async () => {
      try {
        const { networkAllowed } = this.getSettings();
        for (const source of this.listSources().filter((item) => item.enabled === 1)) {
          if (source.kind === 'FOLDER') {
            await scanFolder(source, { repository: this.repository, ocr: this.ocr, counts });
          } else if (!networkAllowed) {
            notes.push(`« ${source.label} » ignoré : accès internet désactivé`);
          } else {
            await crawlSite(source, {
              repository: this.repository,
              media: this.media,
              ocr: this.ocr,
              counts,
              fetchImpl: this.fetchImpl,
              ...(this.crawlLimits ? { limits: this.crawlLimits } : {}),
            });
          }
        }
        return this.repository.finishRun(runId, {
          status: 'DONE',
          counts,
          message: notes.join(' ; ') || null,
        });
      } catch (error) {
        return this.repository.finishRun(runId, {
          status: 'FAILED',
          counts,
          message: error.message,
        });
      }
    })();
    try {
      return await this.running;
    } finally {
      this.running = null;
    }
  }
}

/**
 * Planificateur nocturne : vérifie chaque minute s'il est l'heure choisie et
 * si l'indexation du jour n'a pas encore eu lieu. `now` est injectable (tests).
 */
export function startIndexScheduler(
  getService,
  { intervalMs = 60_000, now = () => new Date() } = {},
) {
  const tick = async () => {
    const service = getService();
    const settings = service.getSettings();
    const date = now();
    const today = date.toISOString().slice(0, 10);
    if (!settings.scheduleEnabled || settings.lastScheduledDate === today) return null;
    if (date.getHours() < settings.scheduleHour || service.running) return null;
    service.repository.updateSettings({ lastScheduledDate: today });
    return service.run('SCHEDULED').catch(() => null);
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  return { tick, stop: () => clearInterval(timer) };
}
