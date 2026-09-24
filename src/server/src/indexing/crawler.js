import { createHash } from 'node:crypto';
import path from 'node:path';
import {
  CancelledError,
  fetchResource,
  normalizeUrl,
  pause,
  readLimited,
  throwIfCancelled,
  validateStartUrl,
} from './fetcher.js';
import { parseRobots } from './robots.js';
import { SITEMAP_LIMITS, parseSitemap } from './sitemap.js';
import { extractText, kindOf } from './text-extract.js';

export { validateStartUrl };

export const CRAWL_LIMITS = Object.freeze({
  maxBytes: 20 * 1024 * 1024,
  timeoutMs: 15_000,
  minDelayMs: 1_000,
  maxRedirects: 5,
  maxRetryWaitMs: 30_000,
});
const ALLOWED_TYPES =
  /^(text\/html|application\/xhtml\+xml|text\/plain|application\/pdf|image\/(png|jpeg|gif|webp|tiff))\b/i;
// Liens jamais suivis : ressources de présentation, archives, audio, vidéo.
const IGNORED_LINK =
  /\.(css|js|mjs|map|ico|svg|woff2?|ttf|eot|zip|gz|tgz|rar|7z|exe|dmg|msi|mp3|wav|ogg|mp4|avi|mov|webm|mkv|rss|atom)$/i;

function robotsHeader(response) {
  const value = (response.headers.get('x-robots-tag') ?? '').toLowerCase();
  return {
    noindex: /\b(noindex|none)\b/.test(value),
    nofollow: /\b(nofollow|none)\b/.test(value),
  };
}

/** Adresses annoncées par les sitemaps du site (robots.txt, sinon /sitemap.xml). */
async function sitemapUrls(start, robots, { fetchImpl, limits, signal, max }) {
  const pending = robots.sitemaps.length ? robots.sitemaps : [new URL('/sitemap.xml', start).href];
  const urls = [];
  const seen = new Set();
  for (let index = 0; index < pending.length && seen.size < SITEMAP_LIMITS.maxFiles; index += 1) {
    const url = normalizeUrl(pending[index], start);
    if (!url || url.host !== start.host || seen.has(url.href)) continue;
    seen.add(url.href);
    try {
      const result = await fetchResource(url, {
        fetchImpl,
        limits,
        signal,
        host: start.host,
        accept: 'application/xml,text/xml;q=0.9',
      });
      if (!result.response?.ok) continue;
      const buffer = await readLimited(result.response, SITEMAP_LIMITS.maxBytes);
      if (!buffer) continue;
      const parsed = parseSitemap(buffer);
      pending.push(...parsed.sitemaps);
      urls.push(...parsed.urls);
      if (urls.length >= max) break;
    } catch (error) {
      if (error instanceof CancelledError) throw error;
      // Sitemap illisible : l'exploration par les liens suffit.
    }
  }
  return urls.slice(0, max);
}

/**
 * Explore un site listé par l'utilisateur (ADR 0011, 0012) : même hôte,
 * robots.txt et directives noindex / nofollow respectés, sitemaps, requêtes
 * conditionnelles, délai entre requêtes, profondeur et nombre bornés.
 * Retourne { complete } : vrai si le site a été parcouru entièrement (les
 * pages disparues peuvent alors être retirées de l'index).
 */
export async function crawlSite(
  source,
  {
    repository,
    media,
    ocr,
    counts,
    fetchImpl = fetch,
    limits = CRAWL_LIMITS,
    signal,
    runId = null,
    report = () => {},
  },
) {
  const start = validateStartUrl(source.location);
  if (!start) {
    counts.errors += 1;
    return { complete: false, message: 'adresse invalide' };
  }
  const options = { fetchImpl, limits, signal, host: start.host };
  let robots = parseRobots('');
  try {
    const { response } = await fetchResource(new URL('/robots.txt', start), {
      ...options,
      accept: 'text/plain',
    });
    if (response?.ok) robots = parseRobots(await response.text());
  } catch (error) {
    if (error instanceof CancelledError) throw error;
    // robots.txt absent ou injoignable : règles par défaut (tout autorisé).
  }
  const delay = Math.max(
    limits.minDelayMs,
    Math.min((robots.crawlDelaySeconds ?? 0) * 1000, 60_000),
  );

  const queue = [{ url: start, depth: 0 }];
  const queued = new Set([start.href]);
  const enqueue = (href, base, depth) => {
    if (depth > source.max_depth) return;
    const next = normalizeUrl(href, base);
    if (!next || next.host !== start.host || queued.has(next.href)) return;
    if (IGNORED_LINK.test(next.pathname)) return;
    queued.add(next.href);
    queue.push({ url: next, depth });
  };
  if (source.max_depth >= 1) {
    for (const href of await sitemapUrls(start, robots, {
      ...options,
      max: source.max_documents * 2,
    })) {
      enqueue(href, start, 1);
    }
  }

  const stored = new Set();
  let fetched = 0;
  let head = 0;
  let startFailed = false;
  for (; head < queue.length && fetched < source.max_documents; head += 1) {
    throwIfCancelled(signal);
    const { url, depth } = queue[head];
    if (!robots.isAllowed(url.pathname + url.search)) {
      counts.skipped += 1;
      continue;
    }
    if (fetched > 0) await pause(delay, signal);
    fetched += 1;
    report({
      current: url.href,
      done: fetched,
      total: Math.min(queue.length, source.max_documents),
    });
    const known = repository.findDocument(source.id, url.href);
    try {
      const result = await fetchResource(url, {
        ...options,
        conditional: known ? { etag: known.etag, lastModified: known.last_modified } : null,
      });
      if (result.notModified && known) {
        counts.unchanged += 1;
        repository.touchDocument(known.id, runId);
        stored.add(known.location);
        for (const href of JSON.parse(known.links ?? '[]')) enqueue(href, url, depth + 1);
        continue;
      }
      const response = result.response;
      if (!response?.ok) {
        // Erreur serveur passagère : le document connu est conservé.
        if (known && (!response || response.status >= 500))
          repository.touchDocument(known.id, runId);
        if (url === start) startFailed = true;
        counts.skipped += 1;
        continue;
      }
      const type = response.headers.get('content-type') ?? '';
      if (!ALLOWED_TYPES.test(type)) {
        await response.body?.cancel().catch(() => {});
        counts.skipped += 1;
        continue;
      }
      const buffer = await readLimited(response, limits.maxBytes);
      if (!buffer) {
        counts.skipped += 1;
        continue;
      }
      const directives = robotsHeader(response);
      const checksum = createHash('sha256').update(buffer).digest('hex');
      const name = decodeURIComponent(path.basename(result.url.pathname) || 'index.html');
      const kind = kindOf(name, type);
      const extracted =
        kind === 'html' || known?.checksum !== checksum || result.url.href !== url.href
          ? await extractText({ buffer, filename: name, mimeType: type, ...(ocr ? { ocr } : {}) })
          : null;
      const links = extracted && !directives.nofollow ? extracted.links : [];
      for (const href of links) enqueue(href, result.url, depth + 1);

      // Adresse canonique du même site : une seule entrée pour plusieurs adresses.
      const canonical = extracted?.canonical ? normalizeUrl(extracted.canonical, result.url) : null;
      const location =
        canonical && canonical.host === start.host ? canonical.href : result.url.href;
      if (directives.noindex || extracted?.noindex || stored.has(location)) {
        counts.skipped += 1;
        continue;
      }
      stored.add(location);
      const existing = location === url.href ? known : repository.findDocument(source.id, location);
      const cache = {
        etag: response.headers.get('etag'),
        lastModified: response.headers.get('last-modified'),
      };
      if (existing?.checksum === checksum) {
        counts.unchanged += 1;
        repository.touchDocument(existing.id, runId);
        continue;
      }
      let mediaId = null;
      if ((kind === 'pdf' || kind === 'image') && media) {
        // PDF et images conservés localement pour une consultation hors ligne.
        const saved = await media.upload({
          filename: name.slice(0, 200),
          contentBase64: buffer.toString('base64'),
          notes: `Récupéré par l'indexation : ${location}`,
        });
        mediaId = saved.id;
      }
      repository.upsertDocument({
        sourceId: source.id,
        location,
        title: extracted.title,
        mimeType: type.split(';')[0],
        sizeBytes: buffer.length,
        checksum,
        status: extracted.status,
        text: extracted.text,
        mediaId,
        ...cache,
        links: links
          .map((href) => normalizeUrl(href, result.url)?.href)
          .filter((href) => href && new URL(href).host === start.host),
        runId,
      });
      counts.indexed += 1;
    } catch (error) {
      if (error instanceof CancelledError) throw error;
      if (known) repository.touchDocument(known.id, runId);
      if (url === start) startFailed = true;
      counts.errors += 1;
    }
  }
  const complete = !startFailed && head >= queue.length;
  return {
    complete,
    message: startFailed
      ? 'site injoignable'
      : complete
        ? null
        : `limite de ${source.max_documents} document(s) atteinte`,
  };
}
