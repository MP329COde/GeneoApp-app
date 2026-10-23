import { stat } from 'node:fs/promises';
import path from 'node:path';
import { ConflictError, ForbiddenError, NotFoundError } from '../errors.js';
import { invalidError, notFoundError } from '../validation/field-errors.js';
import { IndexRepository } from './index-repository.js';
import { scanFolder } from './folder-scanner.js';
import { crawlSite } from './crawler.js';
import { CancelledError, normalizeUrl } from './fetcher.js';
import { OPEN_DATA_PRESETS, dataGouvPage, dataGouvSlug, indexDataset } from './datasets.js';
import {
  CONNECTORS,
  CONNECTOR_LIMITS,
  estimateConnectorPages,
  findConnector,
  indexConnectorPages,
  sanitizeSearchValues,
} from './connectors.js';

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
    throw invalidError(field, `${field} doit être compris entre ${min} et ${max}`, { min, max });
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

  /**
   * Connecteurs multi-sites : catalogue, état d'opt-in et nombre de pages
   * déjà indexées. Aucune requête réseau ici.
   */
  listConnectors() {
    const saved = new Map(this.repository.listConnectors().map((row) => [row.connector_id, row]));
    return CONNECTORS.map((connector) => {
      const row = saved.get(connector.id) ?? null;
      return {
        id: connector.id,
        label: row?.label ?? connector.label,
        baseUrl: connector.baseUrl,
        optedIn: row?.opted_in === 1,
        maxPages: row?.max_pages ?? CONNECTOR_LIMITS.maxPages,
        documentCount: row?.document_count ?? 0,
        lastStatus: row?.last_status ?? null,
        lastMessage: row?.last_message ?? null,
        lastRunAt: row?.last_run_at ?? null,
      };
    });
  }

  /** Connecteur du catalogue, ou erreur si l'identifiant est inconnu. */
  requireConnector(connectorId) {
    const connector = findConnector(connectorId);
    if (!connector) {
      const error = new NotFoundError('Connecteur introuvable');
      error.code = 'CONNECTOR_NOT_FOUND';
      error.translationKey = 'server.indexing.connectorNotFound';
      throw error;
    }
    return connector;
  }

  /**
   * Opt-in explicite par connecteur. Sans lui, aucune requête ne part vers
   * le site ; le déconnecter interrompt aussi les indexations suivantes.
   */
  setConnectorOptIn(connectorId, payload = {}) {
    const connector = this.requireConnector(connectorId);
    const existing = this.repository.findConnector(connector.id);
    const optedIn =
      payload.optedIn === undefined ? Boolean(existing?.opted_in) : Boolean(payload.optedIn);
    const maxPages =
      payload.maxPages === undefined
        ? (existing?.max_pages ?? CONNECTOR_LIMITS.maxPages)
        : boundedInteger(
            payload.maxPages,
            'maxPages',
            1,
            CONNECTOR_LIMITS.maxPages,
            CONNECTOR_LIMITS.maxPages,
          );
    const saved = this.repository.saveConnector({
      connectorId: connector.id,
      label: connector.label,
      baseUrl: connector.baseUrl,
      optedIn,
      maxPages,
    });
    return {
      id: saved.connector_id,
      label: saved.label,
      baseUrl: saved.base_url,
      optedIn: saved.opted_in === 1,
      maxPages: saved.max_pages,
      documentCount: 0,
    };
  }

  /**
   * Estimation du nombre de pages qu'une indexation de ce connecteur
   * produirait. Refusée si l'utilisateur n'a pas autorisé le connecteur
   * ou si l'accès internet est désactivé.
   */
  async estimateConnector(connectorId, values) {
    const connector = this.requireConnector(connectorId);
    this.requireConnectorOptIn(connector.id);
    const state = this.repository.findConnector(connector.id);
    const estimate = await estimateConnectorPages(
      { ...connector, max_pages: state?.max_pages ?? CONNECTOR_LIMITS.maxPages },
      {
        values: sanitizeSearchValues(values),
        fetchImpl: this.fetchImpl,
        ...(this.crawlLimits ? { limits: { ...CONNECTOR_LIMITS, ...this.crawlLimits } } : {}),
      },
    );
    return { connectorId: connector.id, ...estimate };
  }

  /** Vérifie l'opt-in et l'autorisation réseau : deux verrous distincts. */
  requireConnectorOptIn(connectorId) {
    const state = this.repository.findConnector(connectorId);
    if (!state || state.opted_in !== 1) {
      const error = new ForbiddenError(
        'Connecteur non autorisé : activez son indexation locale avant de l’interroger',
      );
      error.code = 'CONNECTOR_NOT_OPTED_IN';
      error.translationKey = 'server.indexing.connectorNotOptedIn';
      throw error;
    }
    if (!this.getSettings().networkAllowed) {
      const error = new ForbiddenError('Accès internet désactivé dans les réglages');
      error.code = 'NETWORK_DISABLED';
      error.translationKey = 'server.indexing.networkDisabled';
      throw error;
    }
    return state;
  }

  /**
   * Indexe localement les pages distantes d'un connecteur autorisé : le
   * contenu est stocké dans l'index local, rien n'est renvoyé au site.
   */
  async indexConnector(connectorId, values) {
    const connector = this.requireConnector(connectorId);
    const state = this.requireConnectorOptIn(connector.id);
    if (this.running) throw new ConflictError('Une indexation est en cours');
    const counts = { indexed: 0, unchanged: 0, skipped: 0, errors: 0, removed: 0 };
    const runId = this.repository.startRun('MANUAL', state.source_id);
    const outcome = await indexConnectorPages(
      { ...connector, max_pages: state.max_pages },
      {
        values: sanitizeSearchValues(values),
        repository: this.repository,
        sourceId: state.source_id,
        counts,
        fetchImpl: this.fetchImpl,
        ...(this.crawlLimits ? { limits: { ...CONNECTOR_LIMITS, ...this.crawlLimits } } : {}),
        runId,
      },
    );
    // Le journal n'accepte que RUNNING, DONE ou FAILED : un refus (robots.txt,
    // site injoignable) est un échec explicite, jamais un succès silencieux.
    const status = outcome.reason ? 'FAILED' : 'DONE';
    this.repository.recordConnectorOutcome(connector.id, {
      status,
      message: outcome.reason ?? null,
    });
    return this.repository.finishRun(runId, {
      status,
      counts,
      message: outcome.reason ?? null,
    });
  }

  presets() {
    return OPEN_DATA_PRESETS;
  }

  async addSource(payload = {}) {
    const preset = payload.preset
      ? OPEN_DATA_PRESETS.find((item) => item.id === payload.preset)
      : null;
    if (payload.preset && !preset) {
      throw invalidError('preset', 'Préréglage inconnu');
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
      throw invalidError('kind', 'Type de source invalide');
    }
    const mode = kind === 'SITE' ? (merged.mode ?? 'CRAWL') : 'CRAWL';
    if (!MODES.includes(mode)) {
      throw invalidError('mode', 'Mode de source invalide');
    }
    let location = typeof merged.location === 'string' ? merged.location.trim() : '';
    let defaultLabel;
    if (kind === 'FOLDER') {
      if (!path.isAbsolute(location)) {
        throw invalidError('location', 'Le dossier doit être un chemin absolu');
      }
      location = path.resolve(location);
      const info = await stat(location).catch(() => null);
      if (!info?.isDirectory()) {
        throw notFoundError('location', 'Dossier introuvable');
      }
      defaultLabel = path.basename(location);
    } else if (mode === 'DATAGOUV') {
      const slug = dataGouvSlug(location);
      if (!slug) {
        throw invalidError(
          'location',
          'Jeu de données data.gouv.fr invalide (adresse ou identifiant)',
        );
      }
      location = dataGouvPage(slug);
      defaultLabel = `data.gouv.fr · ${slug}`;
    } else {
      const url = normalizeUrl(location);
      if (!url || !/^https?:\/\//i.test(location)) {
        throw invalidError('location', 'Adresse http(s) invalide ou avec identifiants');
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
    // Les sources d'un connecteur ne se pilotent pas comme les autres : elles
    // ne sont indexées que par la route dédiée, qui vérifie l'opt-in.
    if (source.connector_id) {
      const error = new ForbiddenError(
        'Cette source appartient à un connecteur : passez par l’indexation du connecteur',
      );
      error.code = 'CONNECTOR_SOURCE';
      error.translationKey = 'server.indexing.connectorSource';
      throw error;
    }
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
