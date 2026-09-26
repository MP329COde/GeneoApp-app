import { stat } from 'node:fs/promises';
import path from 'node:path';
import { ConflictError, NotFoundError, ValidationError } from '../errors.js';
import { IndexRepository } from './index-repository.js';
import { scanFolder } from './folder-scanner.js';
import { crawlSite } from './crawler.js';
import { CancelledError, normalizeUrl } from './fetcher.js';
import { OPEN_DATA_PRESETS, dataGouvPage, dataGouvSlug, indexDataset } from './datasets.js';

const MODES = ['CRAWL', 'DIRECT', 'DATAGOUV'];
const TEXT_STATUSES = ['EXTRACTED', 'OCR', 'UNAVAILABLE'];

/**
 * Requête plein texte FTS5 : mots en préfixe, « expressions exactes » entre
 * guillemets, exclusions avec un tiret (-mot). Toute syntaxe FTS5 saisie est
 * neutralisée (chaque terme est cité).
 */
export function toFtsQuery(query) {
  const include = [];
  const exclude = [];
  const words = (text) =>
    text
      .normalize('NFC')
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean);
  const pattern = /(-?)"([^"]*)"|(\S+)/g;
  for (const match of String(query).matchAll(pattern)) {
    if (match[2] !== undefined) {
      const phrase = words(match[2]);
      if (phrase.length) (match[1] ? exclude : include).push(`"${phrase.join(' ')}"`);
      continue;
    }
    const negative = match[3].startsWith('-') && match[3].length > 1;
    const terms = words(negative ? match[3].slice(1) : match[3]);
    if (negative && terms.length) exclude.push(`"${terms.join(' ')}"`);
    else include.push(...terms.map((term) => `"${term}"*`));
  }
  const positive = include.slice(0, 12).join(' ');
  if (!positive) return '';
  const negatives = exclude.slice(0, 6);
  return negatives.length ? `(${positive}) NOT (${negatives.join(' OR ')})` : positive;
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

function optionalText(value, max) {
  if (value === undefined) return undefined;
  const text = typeof value === 'string' ? value.trim().slice(0, max) : '';
  return text || null;
}

function localDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Indexation de documents (ADR 0011, 0012) : dossiers locaux, sites listés,
 * fichiers de données ouvertes et jeux data.gouv.fr ; recherche plein texte,
 * réglages de planification, journal, progression et annulation.
 */
export class IndexService {
  constructor(
    database,
    { media = null, ocr = null, fetchImpl = fetch, crawlLimits, datasetLimits } = {},
  ) {
    this.repository = new IndexRepository(database);
    this.media = media;
    this.ocr = ocr;
    this.fetchImpl = fetchImpl;
    this.crawlLimits = crawlLimits;
    this.datasetLimits = datasetLimits;
    this.running = null;
    this.controller = null;
    this.progress = null;
    this.repository.failInterruptedRuns();
  }

  listSources() {
    return this.repository.listSources();
  }

  presets() {
    return OPEN_DATA_PRESETS;
  }

  async addSource(payload = {}) {
    const preset = payload.preset
      ? OPEN_DATA_PRESETS.find((item) => item.id === payload.preset)
      : null;
    if (payload.preset && !preset) {
      throw new ValidationError('Préréglage inconnu', { fields: { preset: 'invalide' } });
    }
    const merged = preset
      ? {
          kind: 'SITE',
          mode: preset.mode,
          location: preset.location,
          label: preset.label,
          resourceFilter: preset.resourceFilter,
          ...Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined)),
        }
      : payload;
    const kind = merged.kind;
    if (!['FOLDER', 'SITE'].includes(kind)) {
      throw new ValidationError('Type de source invalide', { fields: { kind: 'invalide' } });
    }
    const mode = kind === 'SITE' ? (merged.mode ?? 'CRAWL') : 'CRAWL';
    if (!MODES.includes(mode)) {
      throw new ValidationError('Mode de source invalide', { fields: { mode: 'invalide' } });
    }
    let location = typeof merged.location === 'string' ? merged.location.trim() : '';
    let defaultLabel;
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
      defaultLabel = path.basename(location);
    } else if (mode === 'DATAGOUV') {
      const slug = dataGouvSlug(location);
      if (!slug) {
        throw new ValidationError('Jeu de données data.gouv.fr invalide (adresse ou identifiant)', {
          fields: { location: 'invalide' },
        });
      }
      location = dataGouvPage(slug);
      defaultLabel = `data.gouv.fr · ${slug}`;
    } else {
      const url = normalizeUrl(location);
      if (!url || !/^https?:\/\//i.test(location)) {
        throw new ValidationError('Adresse http(s) invalide ou avec identifiants', {
          fields: { location: 'invalide' },
        });
      }
      location = url.href;
      defaultLabel =
        mode === 'DIRECT' ? decodeURIComponent(path.basename(url.pathname)) || url.host : url.host;
    }
    const defaults = {
      FOLDER: { depth: 5, documents: 1000 },
      CRAWL: { depth: 2, documents: 100 },
      DIRECT: { depth: 0, documents: 1000 },
      DATAGOUV: { depth: 0, documents: 2000 },
    }[kind === 'FOLDER' ? 'FOLDER' : mode];
    return this.repository.createSource({
      kind,
      mode,
      label: optionalText(merged.label, 120) ?? defaultLabel,
      location,
      maxDepth: boundedInteger(merged.maxDepth, 'maxDepth', 0, 10, defaults.depth),
      maxDocuments: boundedInteger(
        merged.maxDocuments,
        'maxDocuments',
        1,
        5000,
        defaults.documents,
      ),
      resourceFilter: mode === 'DATAGOUV' ? optionalText(merged.resourceFilter, 100) : null,
    });
  }

  requireSource(id) {
    const source = this.repository.findSource(Number(id));
    if (!source) throw new NotFoundError('Source introuvable');
    return source;
  }

  setSourceEnabled(id, enabled) {
    this.requireSource(id);
    return this.repository.updateSource(Number(id), { enabled: Boolean(enabled) });
  }

  /** Modifie une source : activation, nom, profondeur, limite, filtre des ressources. */
  updateSource(id, payload = {}) {
    const source = this.requireSource(id);
    return this.repository.updateSource(source.id, {
      enabled: payload.enabled === undefined ? undefined : Boolean(payload.enabled),
      label: optionalText(payload.label, 120) ?? undefined,
      maxDepth:
        payload.maxDepth === undefined
          ? undefined
          : boundedInteger(payload.maxDepth, 'maxDepth', 0, 10),
      maxDocuments:
        payload.maxDocuments === undefined
          ? undefined
          : boundedInteger(payload.maxDocuments, 'maxDocuments', 1, 5000),
      resourceFilter:
        source.mode === 'DATAGOUV' ? optionalText(payload.resourceFilter, 100) : undefined,
    });
  }

  removeSource(id) {
    if (this.progress?.sourceId === Number(id)) {
      throw new ConflictError('Source en cours d’indexation : annulez d’abord');
    }
    if (!this.repository.removeSource(Number(id))) throw new NotFoundError('Source introuvable');
  }

  /** Vide l'index d'une source ; elle sera relue entièrement à la prochaine exécution. */
  clearSource(id) {
    const source = this.requireSource(id);
    if (this.running) throw new ConflictError('Une indexation est en cours');
    return { removed: this.repository.clearSource(source.id) };
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

  searchOptions(options) {
    const settings = typeof options === 'object' && options !== null ? options : { limit: options };
    const status = TEXT_STATUSES.includes(settings.status) ? settings.status : null;
    return {
      limit: Math.min(Math.max(Number(settings.limit) || 50, 1), 200),
      offset: Math.min(Math.max(Number(settings.offset) || 0, 0), 100_000),
      sourceId: Number(settings.sourceId) || null,
      status,
    };
  }

  /** Résultats (tableau) ; `options` : limite ou { limit, offset, sourceId, status }. */
  search(query, options) {
    const fts = toFtsQuery(query ?? '');
    if (!fts) return [];
    return this.repository.search(fts, this.searchOptions(options));
  }

  /** Page de résultats avec le nombre total de documents correspondants. */
  searchPage(query, options) {
    const fts = toFtsQuery(query ?? '');
    const settings = this.searchOptions(options);
    if (!fts) return { total: 0, offset: settings.offset, hits: [] };
    return {
      total: this.repository.countMatches(fts, settings),
      offset: settings.offset,
      hits: this.repository.search(fts, settings),
    };
  }

  getDocument(id) {
    const document = this.repository.getDocument(Number(id));
    if (!document) throw new NotFoundError('Document introuvable');
    return document;
  }

  listRuns(limit) {
    return this.repository.listRuns(limit);
  }

  status() {
    return {
      running: Boolean(this.running),
      progress: this.progress,
      settings: this.getSettings(),
      sources: this.listSources(),
      runs: this.listRuns(10),
      stats: this.repository.stats(),
      presets: this.presets(),
    };
  }

  /** Demande l'arrêt de l'indexation en cours (effectif entre deux documents). */
  cancel() {
    if (!this.running) return { cancelled: false };
    this.controller?.abort();
    return { cancelled: true };
  }

  async indexSource(source, context) {
    if (source.kind === 'FOLDER') return scanFolder(source, context);
    if (source.mode === 'CRAWL') {
      return crawlSite(source, {
        ...context,
        media: this.media,
        fetchImpl: this.fetchImpl,
        ...(this.crawlLimits ? { limits: this.crawlLimits } : {}),
      });
    }
    return indexDataset(source, {
      ...context,
      media: this.media,
      fetchImpl: this.fetchImpl,
      ...(this.datasetLimits ? { limits: this.datasetLimits } : {}),
    });
  }

  /**
   * Lance une indexation (toutes les sources actives, ou une seule avec
   * `sourceId`) ; une seule à la fois. Les documents disparus d'une source
   * parcourue entièrement sont retirés de l'index.
   */
  async run(trigger = 'MANUAL', { sourceId = null } = {}) {
    if (this.running) throw new ConflictError('Une indexation est déjà en cours');
    const only = sourceId === null ? null : this.requireSource(sourceId);
    const runId = this.repository.startRun(trigger, only?.id ?? null);
    const counts = { indexed: 0, unchanged: 0, skipped: 0, errors: 0, removed: 0 };
    const notes = [];
    this.controller = new AbortController();
    const signal = this.controller.signal;
    this.running = (async () => {
      try {
        const { networkAllowed } = this.getSettings();
        const sources = only ? [only] : this.listSources().filter((item) => item.enabled === 1);
        for (const [index, source] of sources.entries()) {
          if (source.kind !== 'FOLDER' && !networkAllowed) {
            notes.push(`« ${source.label} » ignoré : accès internet désactivé`);
            this.repository.recordSourceOutcome(source.id, {
              status: 'SKIPPED',
              message: 'accès internet désactivé',
            });
            continue;
          }
          const before = { ...counts };
          this.progress = {
            runId,
            sourceId: source.id,
            sourceLabel: source.label,
            sourceIndex: index + 1,
            sourceCount: sources.length,
            current: null,
            done: 0,
            total: null,
            counts,
          };
          try {
            const outcome = await this.indexSource(source, {
              repository: this.repository,
              ocr: this.ocr,
              counts,
              signal,
              runId,
              report: (step) => Object.assign(this.progress, step),
            });
            if (outcome?.complete) counts.removed += this.repository.pruneUnseen(source.id, runId);
            if (outcome?.message) notes.push(`« ${source.label} » : ${outcome.message}`);
            this.repository.recordSourceOutcome(source.id, {
              status: counts.errors > before.errors || !outcome?.complete ? 'PARTIAL' : 'DONE',
              message: outcome?.message ?? null,
            });
          } catch (error) {
            if (error instanceof CancelledError) throw error;
            counts.errors += 1;
            notes.push(`« ${source.label} » : ${error.message}`);
            this.repository.recordSourceOutcome(source.id, {
              status: 'FAILED',
              message: error.message,
            });
          }
        }
        if (counts.removed) notes.push(`${counts.removed} document(s) disparu(s) retiré(s)`);
        return this.repository.finishRun(runId, {
          status: 'DONE',
          counts,
          message: notes.join(' ; ') || null,
        });
      } catch (error) {
        return this.repository.finishRun(runId, {
          status: 'FAILED',
          counts,
          message: [error.message, ...notes].join(' ; '),
        });
      }
    })();
    try {
      return { ...(await this.running), removed: counts.removed };
    } finally {
      this.running = null;
      this.controller = null;
      this.progress = null;
    }
  }

  runSource(id, trigger = 'MANUAL') {
    return this.run(trigger, { sourceId: Number(id) });
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
    const today = localDate(date);
    if (!settings.scheduleEnabled || settings.lastScheduledDate === today) return null;
    if (date.getHours() < settings.scheduleHour || service.running) return null;
    service.repository.updateSettings({ lastScheduledDate: today });
    return service.run('SCHEDULED').catch(() => null);
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  return { tick, stop: () => clearInterval(timer) };
}
