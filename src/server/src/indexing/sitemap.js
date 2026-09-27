import { gunzipSync } from 'node:zlib';
import { decodeEntities } from './text-extract.js';

// Lecture des sitemaps XML (protocole sitemaps.org) : liste d'adresses
// (<urlset>) ou index de sitemaps (<sitemapindex>), éventuellement gzip.

export const SITEMAP_LIMITS = Object.freeze({ maxFiles: 5, maxBytes: 10 * 1024 * 1024 });

export function parseSitemap(buffer) {
  let body = buffer;
  if (body[0] === 0x1f && body[1] === 0x8b) {
    body = gunzipSync(body, { maxOutputLength: SITEMAP_LIMITS.maxBytes * 5 });
  }
  const xml = body.toString('utf8');
  const locations = [...xml.matchAll(/<loc>\s*([\s\S]*?)\s*<\/loc>/gi)].map((match) =>
    decodeEntities(match[1].replace(/^<!\[CDATA\[|\]\]>$/g, '').trim()),
  );
  return /<sitemapindex\b/i.test(xml)
    ? { urls: [], sitemaps: locations }
    : { urls: locations, sitemaps: [] };
}
