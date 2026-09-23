import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { USER_AGENT, parseRobots } from './robots.js';
import { extractText, kindOf } from './text-extract.js';

export const CRAWL_LIMITS = Object.freeze({
  maxBytes: 20 * 1024 * 1024,
  timeoutMs: 15_000,
  minDelayMs: 1_000,
  maxRedirects: 5,
});
const ALLOWED_TYPES =
  /^(text\/html|text\/plain|application\/pdf|image\/(png|jpeg|gif|webp|tiff))\b/i;

/** Adresse de départ acceptable : http(s), sans identifiants. */
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

async function readLimited(response, maxBytes) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  const chunks = [];
  let total = 0;
  for await (const chunk of response.body) {
    total += chunk.length;
    if (total > maxBytes) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Récupère une adresse en suivant les redirections uniquement sur le même
 * hôte. Aucune donnée envoyée : GET simple, sans cookie.
 */
async function fetchSameHost(url, host, { fetchImpl, limits }) {
  let current = url;
  for (let hop = 0; hop <= limits.maxRedirects; hop += 1) {
    const response = await fetchImpl(current, {
      redirect: 'manual',
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/pdf,image/*,text/plain' },
      signal: AbortSignal.timeout(limits.timeoutMs),
    });
    if (response.status >= 300 && response.status < 400) {
      const next = validateStartUrl(new URL(response.headers.get('location') ?? '', current).href);
      if (!next || next.host !== host) return { skipped: 'redirection hors du site' };
      current = next;
      continue;
    }
    return { response, url: current };
  }
  return { skipped: 'trop de redirections' };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Explore un site listé par l'utilisateur (ADR 0011) : même hôte, robots.txt
 * respecté, délai entre requêtes, profondeur et nombre de documents bornés.
 */
export async function crawlSite(
  source,
  { repository, media, ocr, counts, fetchImpl = fetch, limits = CRAWL_LIMITS },
) {
  const start = validateStartUrl(source.location);
  if (!start) {
    counts.errors += 1;
    return;
  }
  let robots = parseRobots('');
  try {
    const { response } = await fetchSameHost(new URL('/robots.txt', start), start.host, {
      fetchImpl,
      limits,
    });
    if (response?.ok) robots = parseRobots(await response.text());
  } catch {
    // robots.txt absent ou injoignable : règles par défaut (tout autorisé).
  }
  const delay = Math.max(limits.minDelayMs, (robots.crawlDelaySeconds ?? 0) * 1000);
  const queue = [{ url: start, depth: 0 }];
  const visited = new Set();
  let fetched = 0;
  while (queue.length > 0 && fetched < source.max_documents) {
    const { url, depth } = queue.shift();
    const key = url.href;
    if (visited.has(key)) continue;
    visited.add(key);
    if (!robots.isAllowed(url.pathname + url.search)) {
      counts.skipped += 1;
      continue;
    }
    if (fetched > 0) await sleep(delay);
    fetched += 1;
    try {
      const result = await fetchSameHost(url, start.host, { fetchImpl, limits });
      if (!result.response?.ok) {
        counts.skipped += 1;
        continue;
      }
      const type = result.response.headers.get('content-type') ?? '';
      if (!ALLOWED_TYPES.test(type)) {
        counts.skipped += 1;
        continue;
      }
      const buffer = await readLimited(result.response, limits.maxBytes);
      if (!buffer) {
        counts.skipped += 1;
        continue;
      }
      const checksum = createHash('sha256').update(buffer).digest('hex');
      const location = result.url.href;
      const name = decodeURIComponent(path.basename(result.url.pathname) || 'index.html');
      const kind = kindOf(name, type);
      let extracted;
      let mediaId = null;
      if (repository.findDocument(source.id, location)?.checksum === checksum) {
        counts.unchanged += 1;
        extracted =
          kind === 'html' ? await extractText({ buffer, filename: name, mimeType: type }) : null;
      } else {
        let filePath = null;
        let directory = null;
        if (kind === 'ocr') {
          // PDF et images conservés localement pour une consultation hors ligne.
          if (media) {
            const stored = await media.upload({
              filename: name.slice(0, 200),
              contentBase64: buffer.toString('base64'),
              notes: `Récupéré par l'indexation : ${location}`,
            });
            mediaId = stored.id;
          }
          directory = await mkdtemp(path.join(tmpdir(), 'geneoapp-ocr-'));
          filePath = path.join(directory, `document${path.extname(name) || '.bin'}`);
          await writeFile(filePath, buffer);
        }
        try {
          extracted = await extractText({ buffer, filename: name, mimeType: type, filePath, ocr });
        } finally {
          if (directory) await rm(directory, { recursive: true, force: true });
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
        });
        counts.indexed += 1;
      }
      if (extracted && depth < source.max_depth) {
        for (const href of extracted.links) {
          const next = validateStartUrl(new URL(href, result.url).href);
          if (next && next.host === start.host && !visited.has(next.href)) {
            queue.push({ url: next, depth: depth + 1 });
          }
        }
      }
    } catch {
      counts.errors += 1;
    }
  }
}
