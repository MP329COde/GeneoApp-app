import { USER_AGENT } from './robots.js';

// Récupération HTTP de l'indexation (ADR 0011, 0012) : GET simple sans cookie
// ni donnée de l'utilisateur, redirections suivies manuellement et filtrées,
// requêtes conditionnelles (ETag, Last-Modified), reprise unique sur 429/503,
// taille bornée et annulation.

export const ACCEPT = 'text/html,application/xhtml+xml,application/pdf,image/*,text/plain;q=0.9';

/** Adresse acceptable : http(s), sans identifiants ; fragment retiré. */
export function validateStartUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
  url.hash = '';
  return url;
}

const TRACKING_PARAMS = /^(utm_\w+|fbclid|gclid|msclkid|mc_cid|mc_eid|_ga)$/i;

/** Forme canonique d'une adresse : sans fragment ni paramètres de suivi. */
export function normalizeUrl(value, base) {
  let url;
  try {
    url = validateStartUrl(new URL(value, base).href);
  } catch {
    return null;
  }
  if (!url) return null;
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
  }
  url.search = url.searchParams.toString() ? `?${url.searchParams}` : '';
  return url;
}

export class CancelledError extends Error {
  constructor() {
    super('Indexation annulée');
    this.name = 'CancelledError';
  }
}

export function throwIfCancelled(signal) {
  if (signal?.aborted) throw new CancelledError();
}

/** Attente interrompue par l'annulation. */
export function pause(ms, signal) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, ms);
    function done() {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }
    function onAbort() {
      clearTimeout(timer);
      reject(new CancelledError());
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** Lit le corps sans dépasser `maxBytes` ; null si trop volumineux. */
export async function readLimited(response, maxBytes) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel().catch(() => {});
    return null;
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of response.body ?? []) {
    total += chunk.length;
    if (total > maxBytes) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function retryDelayMs(response, maxWaitMs) {
  const header = response.headers.get('retry-after');
  const seconds = header === null ? NaN : Number(header);
  const date = header === null ? NaN : Date.parse(header) - Date.now();
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Number.isFinite(date) ? date : 5_000;
  return Math.min(Math.max(ms, 1_000), maxWaitMs);
}

/**
 * Récupère une adresse.
 * - `host` : hôte imposé (robot) ; toute redirection vers un autre hôte est refusée.
 *   Sans `host` (fichier direct), une redirection vers un autre hôte n'est suivie qu'en https.
 * - `conditional` : { etag, lastModified } connus → « not-modified » si inchangé.
 * Retourne { response, url }, { notModified: true, url } ou { skipped: raison }.
 */
export async function fetchResource(
  url,
  { fetchImpl, limits, signal, host = null, conditional = null, accept = ACCEPT },
) {
  let current = url;
  let retried = false;
  for (let hop = 0; hop <= limits.maxRedirects;) {
    throwIfCancelled(signal);
    const headers = { 'user-agent': USER_AGENT, accept };
    if (conditional?.etag) headers['if-none-match'] = conditional.etag;
    if (conditional?.lastModified) headers['if-modified-since'] = conditional.lastModified;
    const timeout = AbortSignal.timeout(limits.timeoutMs);
    let response;
    try {
      response = await fetchImpl(current, {
        redirect: 'manual',
        credentials: 'omit',
        headers,
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
    } catch (error) {
      throwIfCancelled(signal);
      throw error;
    }
    if (response.status === 304) return { notModified: true, url: current };
    if ((response.status === 429 || response.status === 503) && !retried) {
      retried = true;
      await response.body?.cancel().catch(() => {});
      await pause(retryDelayMs(response, limits.maxRetryWaitMs ?? 30_000), signal);
      continue;
    }
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel().catch(() => {});
      const next = normalizeUrl(response.headers.get('location') ?? '', current);
      if (!next) return { skipped: 'redirection invalide' };
      if (host ? next.host !== host : next.host !== current.host && next.protocol !== 'https:') {
        return { skipped: 'redirection hors du site' };
      }
      current = next;
      hop += 1;
      continue;
    }
    return { response, url: current };
  }
  return { skipped: 'trop de redirections' };
}
