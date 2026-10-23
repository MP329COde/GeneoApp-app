// Passerelle générique renderer → API locale.
//
// Chaque route a d'abord eu son propre canal IPC, ce qui oblige à écrire quatre
// fois (canal, préchargement, handler, client) chaque nouvelle fonction. Cette
// passerelle transmet une requête à l'API Express embarquée (même validation,
// mêmes règles, mêmes annulations Ctrl+Z que par HTTP) en n'acceptant que les
// préfixes d'API connus, des méthodes JSON, des chemins sans traversée et un
// jeton local que le renderer ne voit jamais circuler sur le réseau.

// Doit rester identique aux montages de `server/src/routes/index.js` (un test le vérifie).
export const API_PREFIXES = Object.freeze([
  'history',
  'indexing',
  'persons',
  'places',
  'events',
  'unions',
  'parentages',
  'sources',
  'assertions',
  'media',
  'search',
  'audit',
  'notifications',
  'gedcom',
  'accounts',
  'trash',
  'backups',
  'graph',
  'notes',
  'notebook',
  'statistics',
  'reports',
  'ai',
]);

const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const MAX_BODY_BYTES = 60 * 1024 * 1024;

/**
 * Un chemin est accepté s'il commence par /api/<préfixe connu>, sans segment
 * relatif, séparateur inverse, caractère de contrôle ni encodage de ces cas.
 */
export function isAllowedApiPath(path) {
  if (typeof path !== 'string' || path.length > 2000) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(path)) return false;
  const [pathname] = path.split('?');
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return false;
  }
  if (decoded !== pathname && /(^|\/)\.\.?(\/|$)|\\|\/\//.test(decoded)) return false;
  if (/(^|\/)\.\.?(\/|$)|\/\//.test(pathname)) return false;
  const match = /^\/api\/([a-z]+)(\/|$|\?)/.exec(path);
  return Boolean(match && API_PREFIXES.includes(match[1]));
}

export function createApiProxy({ token, fetchImpl = globalThis.fetch } = {}) {
  let baseUrl = null;
  return {
    setBaseUrl(url) {
      baseUrl = url;
    },

    /** @returns {{ status: number, body: unknown }} corps JSON ou null */
    async request({ method = 'GET', path, body, sessionToken, actor } = {}) {
      if (!baseUrl) throw new Error('API locale indisponible');
      if (!METHODS.has(method)) throw new TypeError('Méthode non autorisée');
      if (!isAllowedApiPath(path)) throw new TypeError('Chemin d’API non autorisé');
      const payload = body === undefined ? undefined : JSON.stringify(body);
      if (payload !== undefined && Buffer.byteLength(payload) > MAX_BODY_BYTES) {
        throw new TypeError('Corps de requête trop volumineux');
      }
      const response = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers: {
          'x-geneoapp-token': token,
          ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
          ...(typeof sessionToken === 'string' ? { 'x-geneoapp-session': sessionToken } : {}),
          ...(typeof actor === 'string' ? { 'x-geneoapp-actor': actor } : {}),
        },
        body: payload,
      });
      const text = await response.text();
      return { status: response.status, body: text ? JSON.parse(text) : null };
    },
  };
}
