import { createHash } from 'node:crypto';
import path from 'node:path';
import { readZip } from '../gedcom/zip.js';
import {
  CancelledError,
  fetchResource,
  normalizeUrl,
  readLimited,
  throwIfCancelled,
} from './fetcher.js';
import { isStructuredData, recordChunks } from './records.js';
import { SUPPORTED_EXTENSIONS, extractText, kindOf } from './text-extract.js';

// Données ouvertes (ADR 0012) : fichier direct téléchargé tel quel, ou jeu de
// données data.gouv.fr dont les ressources sont listées par l'API publique.
// Aucun lien n'est suivi ; seules les adresses choisies sont téléchargées.

export const DATASET_LIMITS = Object.freeze({
  maxBytes: 300 * 1024 * 1024,
  timeoutMs: 10 * 60_000,
  maxRedirects: 5,
  maxRetryWaitMs: 30_000,
  maxResources: 20,
  zip: {
    maxEntries: 500,
    maxEntryBytes: 400 * 1024 * 1024,
    maxTotalBytes: 800 * 1024 * 1024,
    maxCompressionRatio: 200,
  },
});
const DATAGOUV_HOST = 'www.data.gouv.fr';
const DATAGOUV_FORMATS = new Set(['csv', 'tsv', 'json', 'geojson', 'txt', 'zip', 'pdf', 'ged']);
const DATA_ACCEPT =
  'text/csv,application/json,text/plain,application/zip,application/pdf,*/*;q=0.5';
const BATCH = 100;

/** Préréglages de données ouvertes utiles en généalogie. */
export const OPEN_DATA_PRESETS = Object.freeze([
  {
    id: 'insee-deces',
    label: 'INSEE — personnes décédées en France depuis 1970',
    mode: 'DATAGOUV',
    location: 'https://www.data.gouv.fr/fr/datasets/fichier-des-personnes-decedees/',
    resourceFilter: 'deces-2024',
    hint: 'Choisissez une année (« deces-1985 ») ou un mois (« deces-2025-m03 ») : chaque fichier annuel pèse plusieurs dizaines de Mo.',
  },
]);

/** Identifiant (slug) d'un jeu data.gouv.fr à partir de son adresse ou du slug seul. */
export function dataGouvSlug(value) {
  const text = String(value ?? '').trim();
  if (/^[\w-]{3,200}$/.test(text)) return text;
  try {
    const url = new URL(text);
    if (url.host !== DATAGOUV_HOST && url.host !== 'data.gouv.fr') return null;
    return /\/datasets\/([\w-]{3,200})\/?$/.exec(url.pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}

export function dataGouvPage(slug) {
  return `https://${DATAGOUV_HOST}/fr/datasets/${slug}/`;
}

async function readJson(url, { fetchImpl, limits, signal }) {
  const result = await fetchResource(url, {
    fetchImpl,
    limits: { ...limits, timeoutMs: Math.min(limits.timeoutMs, 30_000) },
    signal,
    host: url.host,
    accept: 'application/json',
  });
  if (!result.response?.ok) {
    throw new Error(`catalogue injoignable (${result.response?.status ?? result.skipped})`);
  }
  const buffer = await readLimited(result.response, 10 * 1024 * 1024);
  if (!buffer) throw new Error('réponse du catalogue trop volumineuse');
  return JSON.parse(buffer.toString('utf8'));
}

/** Ressources téléchargeables d'un jeu data.gouv.fr, filtrées. */
export async function dataGouvResources(source, { fetchImpl, limits, signal }) {
  const slug = dataGouvSlug(source.location);
  if (!slug) throw new Error('jeu de données data.gouv.fr invalide');
  const dataset = await readJson(new URL(`https://${DATAGOUV_HOST}/api/1/datasets/${slug}/`), {
    fetchImpl,
    limits,
    signal,
  });
  const filter = (source.resource_filter ?? '').trim().toLowerCase();
  const matching = (dataset.resources ?? [])
    .map((resource) => ({
      title: String(resource.title ?? '').trim(),
      url: normalizeUrl(resource.url ?? ''),
      format: String(resource.format ?? '').toLowerCase(),
    }))
    .filter(
      ({ url, format }) =>
        url &&
        (DATAGOUV_FORMATS.has(format) ||
          DATAGOUV_FORMATS.has(path.extname(url.pathname).slice(1).toLowerCase())),
    )
    .filter(
      ({ title, url }) =>
        !filter || title.toLowerCase().includes(filter) || url.href.toLowerCase().includes(filter),
    );
  // Nom exact (« deces-2024 » → deces-2024.txt) : évite d'ajouter les fichiers
  // mensuels ou trimestriels qui en reprennent le contenu.
  const stem = (value) => value.toLowerCase().replace(/\.[a-z0-9]+$/, '');
  const exact = matching.filter(
    ({ title, url }) => stem(title) === filter || stem(path.basename(url.pathname)) === filter,
  );
  const resources = exact.length ? exact : matching;
  return {
    title: dataset.title ?? slug,
    total: resources.length,
    resources: resources.slice(0, limits.maxResources ?? DATASET_LIMITS.maxResources),
  };
}

const yieldToEventLoop = () => new Promise((resolve) => setImmediate(resolve));

/** Fichiers indexables contenus dans une réponse (archive ZIP dépliée). */
function unpack(buffer, filename, limits) {
  const isZip =
    path.extname(filename).toLowerCase() === '.zip' ||
    (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04);
  if (!isZip || /\.(docx|xlsx|pptx|odt|ods|odp)$/i.test(filename)) {
    return [{ name: filename, entry: null, content: buffer }];
  }
  return readZip(buffer, limits.zip)
    .filter((entry) => SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => ({
      name: path.basename(entry.name),
      entry: entry.name,
      content: entry.content,
    }));
}

/**
 * Télécharge et indexe une ressource. Un fichier de données est découpé en
 * lots d'enregistrements (« adresse#n ») ; les autres documents forment une
 * seule entrée. Retourne { truncated }.
 */
async function indexResource(resource, source, job) {
  const { repository, media, ocr, counts, fetchImpl, limits, signal, runId, budget } = job;
  const prefix = `${resource.url.href}#`;
  const known = repository.findFirstWithPrefix(source.id, prefix);
  const result = await fetchResource(resource.url, {
    fetchImpl,
    limits,
    signal,
    accept: DATA_ACCEPT,
    conditional: known ? { etag: known.etag, lastModified: known.last_modified } : null,
  });
  if (result.notModified && known) {
    counts.unchanged += repository.touchPrefix(source.id, prefix, runId);
    return { truncated: false };
  }
  if (!result.response?.ok) {
    if (known && (!result.response || result.response.status >= 500)) {
      repository.touchPrefix(source.id, prefix, runId);
    }
    counts.skipped += 1;
    return { truncated: false, failed: true };
  }
  const type = (result.response.headers.get('content-type') ?? '').split(';')[0].trim();
  const buffer = await readLimited(result.response, limits.maxBytes);
  if (!buffer) {
    counts.skipped += 1;
    return { truncated: false, failed: true, message: 'fichier trop volumineux' };
  }
  const checksum = createHash('sha256').update(buffer).digest('hex');
  if (known?.checksum === checksum) {
    counts.unchanged += repository.touchPrefix(source.id, prefix, runId);
    return { truncated: false };
  }
  const cache = {
    etag: result.response.headers.get('etag'),
    lastModified: result.response.headers.get('last-modified'),
  };
  const filename = decodeURIComponent(path.basename(result.url.pathname)) || 'donnees';
  const label = resource.title || filename;
  let truncated = false;

  for (const file of unpack(buffer, filename, limits)) {
    throwIfCancelled(signal);
    const keyPrefix = file.entry ? `${prefix}${file.entry}:` : prefix;
    const title = file.entry ? `${label} › ${file.name}` : label;
    const fileType = file.entry ? '' : type;
    let chunks;
    let status = 'EXTRACTED';
    if (isStructuredData(file.name, fileType)) {
      chunks = recordChunks({ buffer: file.content, filename: title, mimeType: fileType }).chunks;
    } else {
      const extracted = await extractText({
        buffer: file.content,
        filename: file.name,
        mimeType: fileType,
        ...(ocr ? { ocr } : {}),
      });
      status = extracted.status;
      chunks = [
        {
          key: '1',
          title: extracted.title === file.name ? title : extracted.title,
          text: extracted.text,
        },
      ];
      const kind = kindOf(file.name, fileType);
      if ((kind === 'pdf' || kind === 'image') && media) {
        const saved = await media.upload({
          filename: file.name.slice(0, 200),
          contentBase64: file.content.toString('base64'),
          notes: `Récupéré par l'indexation : ${resource.url.href}`,
        });
        chunks[0].mediaId = saved.id;
      }
    }
    if (chunks.length > budget.remaining) {
      chunks = chunks.slice(0, budget.remaining);
      truncated = true;
    }
    for (let start = 0; start < chunks.length; start += BATCH) {
      throwIfCancelled(signal);
      repository.transaction(() => {
        for (const chunk of chunks.slice(start, start + BATCH)) {
          repository.upsertDocument({
            sourceId: source.id,
            location: `${keyPrefix}${chunk.key}`,
            title: chunk.title,
            mimeType: fileType || null,
            sizeBytes: buffer.length,
            checksum,
            status: chunk.text ? status : 'UNAVAILABLE',
            text: chunk.text,
            mediaId: chunk.mediaId ?? null,
            ...cache,
            runId,
          });
        }
      });
      counts.indexed += Math.min(BATCH, chunks.length - start);
      budget.remaining -= Math.min(BATCH, chunks.length - start);
      job.report({ current: title, done: budget.total - budget.remaining, total: budget.total });
      await yieldToEventLoop();
    }
    if (budget.remaining <= 0) {
      truncated = true;
      break;
    }
  }
  return { truncated };
}

/**
 * Indexe une source de données ouvertes (mode DIRECT ou DATAGOUV).
 * Retourne { complete, message }.
 */
export async function indexDataset(
  source,
  {
    repository,
    media,
    ocr,
    counts,
    fetchImpl = fetch,
    limits = DATASET_LIMITS,
    signal,
    runId = null,
    report = () => {},
  },
) {
  let resources;
  let note = null;
  if (source.mode === 'DATAGOUV') {
    try {
      const listing = await dataGouvResources(source, { fetchImpl, limits, signal });
      resources = listing.resources;
      if (listing.total === 0) {
        return { complete: false, message: 'aucune ressource ne correspond au filtre' };
      }
      if (listing.total > resources.length) {
        note = `${resources.length} ressource(s) sur ${listing.total} (affinez le filtre)`;
      }
    } catch (error) {
      if (error instanceof CancelledError) throw error;
      counts.errors += 1;
      return { complete: false, message: error.message };
    }
  } else {
    const url = normalizeUrl(source.location);
    if (!url) {
      counts.errors += 1;
      return { complete: false, message: 'adresse invalide' };
    }
    resources = [{ title: source.label, url }];
  }
  const budget = { total: source.max_documents, remaining: source.max_documents };
  const job = { repository, media, ocr, counts, fetchImpl, limits, signal, runId, budget, report };
  let complete = note === null;
  let message = note;
  for (const resource of resources) {
    throwIfCancelled(signal);
    if (budget.remaining <= 0) {
      complete = false;
      message = `limite de ${source.max_documents} lot(s) atteinte`;
      break;
    }
    try {
      const outcome = await indexResource(resource, source, job);
      if (outcome.truncated) {
        complete = false;
        message = `limite de ${source.max_documents} lot(s) atteinte`;
      }
      if (outcome.failed) {
        complete = false;
        message = outcome.message ?? `« ${resource.title || resource.url.href} » injoignable`;
      }
    } catch (error) {
      if (error instanceof CancelledError) throw error;
      repository.touchPrefix(source.id, `${resource.url.href}#`, runId);
      counts.errors += 1;
      complete = false;
      message = `« ${resource.title || resource.url.href} » : ${error.message}`;
    }
  }
  return { complete, message };
}
