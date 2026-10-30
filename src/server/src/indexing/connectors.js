import { createHash } from 'node:crypto';
import {
  CancelledError,
  fetchResource,
  normalizeUrl,
  pause,
  readLimited,
  throwIfCancelled,
} from './fetcher.js';
import { parseRobots } from './robots.js';
import { extractText } from './text-extract.js';

// Connecteurs de recherche multi-sites (issue #49).
//
// L'application ne contacte jamais un site sans autorisation explicite de
// l'utilisateur : chaque connecteur est « opt-in » (table index_connectors).
// Sans opt-in, aucune requête ne part vers le site et aucune donnée n'est
// transmise.
//
// Garanties appliquées à chaque requête :
// - l'adresse vient du catalogue serveur, jamais du client : le client n'envoie
//   que des valeurs de recherche (nom, prénom, année, lieu) ;
// - le modèle de recherche ne connaît que ces quatre variables, encodées ;
// - `robots.txt` du site est consulté avant tout et les adresses interdites
//   ne sont jamais demandées ;
// - une seule origine par requête, sans identifiants ni cookies
//   (`credentials: 'omit'` dans fetcher.js) ;
// - délai entre deux requêtes, temps de réponse et taille bornés ;
// - nombre de pages et profondeur bornés par le connecteur.
//
// Le contenu récupéré est extrait en texte (aucun code distant exécuté) puis
// stocké dans l'index local existant (indexed_documents / documents_fts).

export const CONNECTOR_LIMITS = Object.freeze({
  maxBytes: 5 * 1024 * 1024,
  timeoutMs: 15_000,
  minDelayMs: 1_000,
  maxRedirects: 3,
  maxRetryWaitMs: 30_000,
  maxPages: 50,
});

/** Variables de recherche acceptées, et elles seules. */
export const SEARCH_FIELDS = Object.freeze(['nom', 'prenom', 'annee', 'lieu']);
const MAX_FIELD_LENGTH = 120;

/** Catalogue des connecteurs connus. L'adresse et le modèle sont figés ici. */
export const CONNECTORS = Object.freeze([
  {
    id: 'geneanet',
    label: 'Geneanet',
    baseUrl: 'https://www.geneanet.org',
    template: 'https://www.geneanet.org/fonds/individus/?nom={nom}&prenom={prenom}&go=1',
  },
  {
    id: 'familysearch',
    label: 'FamilySearch',
    baseUrl: 'https://www.familysearch.org',
    template:
      'https://www.familysearch.org/search/record/results?q.givenName={prenom}&q.surname={nom}&q.birthLikeDate.from={annee}',
  },
  {
    id: 'gallica',
    label: 'Gallica (BnF)',
    baseUrl: 'https://gallica.bnf.fr',
    template:
      'https://gallica.bnf.fr/services/engine/search/sru?operation=searchRetrieve&query=gallica%20all%20%22{prenom}%20{nom}%22',
  },
]);

export function findConnector(connectorId) {
  return CONNECTORS.find((connector) => connector.id === connectorId) ?? null;
}

/**
 * Ne garde que les variables de recherche connues, sans caractère de
 * contrôle et tronquées : le client ne peut pas injecter d'autres données.
 */
export function sanitizeSearchValues(values = {}) {
  const clean = {};
  for (const field of SEARCH_FIELDS) {
    const raw = typeof values?.[field] === 'string' ? values[field] : '';
    clean[field] = raw
      // eslint-disable-next-line no-control-regex -- on neutralise les caracteres de controle
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .trim()
      .slice(0, MAX_FIELD_LENGTH);
  }
  return clean;
}

/** Adresse de recherche du connecteur pour les valeurs données. */
export function buildConnectorUrl(connector, values) {
  if (!connector) return null;
  const clean = sanitizeSearchValues(values);
  return connector.template.replace(/\{([a-z]+)\}/g, (_, name) =>
    encodeURIComponent(SEARCH_FIELDS.includes(name) ? clean[name] : ''),
  );
}

function robotsFor(url, { fetchImpl, limits, signal }) {
  const robotsUrl = new URL('/robots.txt', url);
  return fetchResource(robotsUrl, {
    fetchImpl,
    limits,
    signal,
    host: robotsUrl.host,
    accept: 'text/plain',
  })
    .then(async (result) => {
      if (!result.response?.ok) return parseRobots('');
      return parseRobots(await result.response.text());
    })
    .catch((error) => {
      if (error instanceof CancelledError) throw error;
      // robots.txt illisible : règles par défaut (tout autorisé), comme
      // pour l'exploration des sites.
      return parseRobots('');
    });
}

/** Liens candidats : même origine, autorisés par robots.txt, pas de média. */
const IGNORED_LINK =
  /\.(css|js|mjs|map|ico|svg|woff2?|ttf|eot|zip|gz|tgz|rar|7z|exe|dmg|msi|mp3|wav|ogg|mp4|avi|mov|webm|mkv|rss|atom|png|jpe?g|gif|webp|tiff?|pdf)$/i;

function candidateLinks(links, base, host, robots) {
  const seen = new Set();
  const result = [];
  for (const href of links ?? []) {
    const url = normalizeUrl(href, base);
    if (!url || url.host !== host) continue;
    if (IGNORED_LINK.test(url.pathname)) continue;
    if (!robots.isAllowed(url.pathname + url.search)) continue;
    if (seen.has(url.href)) continue;
    seen.add(url.href);
    result.push(url);
  }
  return result;
}

/**
 * Estimation du nombre de pages qu'une indexation de ce connecteur
 *Indexerait : la page de résultats et les pages autorisées qu'elle renvoie.
 * Aucune écriture dans l'index.
 */
export async function estimateConnectorPages(
  connector,
  { values, fetchImpl = fetch, limits = CONNECTOR_LIMITS, signal } = {},
) {
  const url = buildConnectorUrl(connector, values);
  if (!url) return { pages: 0, capped: false, reason: 'INVALID_ADDRESS' };
  const start = new URL(url);
  const robots = await robotsFor(start, { fetchImpl, limits, signal });
  if (!robots.isAllowed(start.pathname + start.search)) {
    return { pages: 0, capped: false, reason: 'ROBOTS_DISALLOWED' };
  }
  const result = await fetchResource(start, {
    fetchImpl,
    limits,
    signal,
    host: start.host,
  });
  if (!result.response?.ok) {
    return { pages: 0, capped: false, reason: 'UNREACHABLE' };
  }
  const buffer = await readLimited(result.response, limits.maxBytes);
  if (!buffer) return { pages: 0, capped: false, reason: 'TOO_LARGE' };
  const type = result.response.headers.get('content-type') ?? '';
  const extracted = await extractText({
    buffer,
    filename: 'recherche.html',
    mimeType: type.includes('html') ? type : 'text/html',
  });
  const links = candidateLinks(extracted.links, result.url, start.host, robots);
  const maxPages = Math.min(connector.max_pages ?? limits.maxPages, limits.maxPages);
  const pages = Math.min(links.length + 1, maxPages);
  return { pages, capped: links.length + 1 > maxPages, reason: null, links: links.length };
}

/**
 * Indexe localement les pages distantes d'un connecteur autorisé.
 * Renvoie { indexed, skipped, pages, reason } ; `reason` vaut
 * 'ROBOTS_DISALLOWED' si le site interdit la recherche.
 */
export async function indexConnectorPages(
  connector,
  {
    values,
    repository,
    sourceId,
    counts = { indexed: 0, skipped: 0, errors: 0 },
    fetchImpl = fetch,
    limits = CONNECTOR_LIMITS,
    signal,
    runId = null,
    report = () => {},
  },
) {
  const url = buildConnectorUrl(connector, values);
  if (!url) return { indexed: 0, skipped: 0, pages: 0, reason: 'INVALID_ADDRESS' };
  const start = new URL(url);
  const robots = await robotsFor(start, { fetchImpl, limits, signal });
  if (!robots.isAllowed(start.pathname + start.search)) {
    counts.skipped += 1;
    return { indexed: 0, skipped: 1, pages: 0, reason: 'ROBOTS_DISALLOWED' };
  }
  const delay = Math.max(
    limits.minDelayMs,
    Math.min((robots.crawlDelaySeconds ?? 0) * 1000, 60_000),
  );
  const maxPages = Math.min(connector.max_pages ?? limits.maxPages, limits.maxPages);
  const pages = [];

  const result = await fetchResource(start, {
    fetchImpl,
    limits,
    signal,
    host: start.host,
  });
  if (!result.response?.ok) {
    counts.errors += 1;
    return { indexed: 0, skipped: 0, pages: 0, reason: 'UNREACHABLE' };
  }
  const buffer = await readLimited(result.response, limits.maxBytes);
  if (!buffer) {
    counts.skipped += 1;
    return { indexed: 0, skipped: 1, pages: 0, reason: 'TOO_LARGE' };
  }
  const type = result.response.headers.get('content-type') ?? '';
  const extracted = await extractText({
    buffer,
    filename: 'recherche.html',
    mimeType: type.includes('html') ? type : 'text/html',
  });
  const links = candidateLinks(extracted.links, result.url, start.host, robots);
  pages.push({ url: result.url.href, title: extracted.title, buffer, type, extracted });

  let fetched = 1;
  for (const link of links) {
    if (fetched >= maxPages) break;
    throwIfCancelled(signal);
    await pause(delay, signal);
    fetched += 1;
    report({ current: link.href, done: fetched, total: maxPages });
    try {
      const page = await fetchResource(link, {
        fetchImpl,
        limits,
        signal,
        host: start.host,
      });
      if (!page.response?.ok) {
        counts.skipped += 1;
        continue;
      }
      const pageBuffer = await readLimited(page.response, limits.maxBytes);
      if (!pageBuffer) {
        counts.skipped += 1;
        continue;
      }
      const pageType = page.response.headers.get('content-type') ?? '';
      const pageExtracted = await extractText({
        buffer: pageBuffer,
        filename: 'page.html',
        mimeType: pageType.includes('html') ? pageType : 'text/html',
      });
      pages.push({
        url: page.url.href,
        title: pageExtracted.title,
        buffer: pageBuffer,
        type: pageType,
        extracted: pageExtracted,
      });
    } catch (error) {
      if (error instanceof CancelledError) throw error;
      counts.errors += 1;
    }
  }

  for (const page of pages) {
    throwIfCancelled(signal);
    const checksum = createHash('sha256').update(page.buffer).digest('hex');
    repository.upsertDocument({
      sourceId,
      location: page.url,
      title: page.extracted.title || page.url,
      mimeType: (page.type.split(';')[0] || 'text/html').trim(),
      sizeBytes: page.buffer.length,
      checksum,
      status: page.extracted.status,
      text: page.extracted.text,
      etag: null,
      lastModified: null,
      links: null,
      runId,
    });
    counts.indexed += 1;
  }
  return { indexed: pages.length, skipped: 0, pages: pages.length, reason: null };
}
