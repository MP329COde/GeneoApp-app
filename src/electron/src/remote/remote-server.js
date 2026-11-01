// Mode « Serveur distant » de l'app de bureau : la fenêtre charge le client servi
// par un serveur GeneoApp en mode web (docs/WEB.md). Choix retenu : charger le client
// du serveur (même origine que l'API, donc contrôle d'origine/CSRF respecté) plutôt
// que le client local avec une API distante (CORS, CSP, Origin différent).
// Le jeton est injecté en `Authorization: Bearer` uniquement vers l'origine du serveur.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export function isLoopbackHost(hostname) {
  return LOOPBACK.has(String(hostname).toLowerCase());
}

/** Normalise la saisie : renvoie `{ url, origin, insecure }` ou `{ error: code }`. */
export function normalizeServerUrl(input) {
  let text = String(input ?? '').trim();
  if (!text) return { error: 'url-empty' };
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = `https://${text}`;
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    return { error: 'url-invalid' };
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return { error: 'url-scheme' };
  if (parsed.username || parsed.password) return { error: 'url-credentials' };
  const insecure = parsed.protocol === 'http:' && !isLoopbackHost(parsed.hostname);
  parsed.hash = '';
  parsed.search = '';
  const url = parsed.href.replace(/\/+$/, '');
  return { url, origin: parsed.origin, insecure };
}

const MESSAGES = {
  fr: {
    'url-empty': "Saisissez l'adresse du serveur.",
    'url-invalid': 'Adresse du serveur invalide (exemple : https://geneo.exemple.fr).',
    'url-scheme': "L'adresse doit commencer par https:// ou http://.",
    'url-credentials': "N'incluez pas d'identifiants dans l'adresse ; utilisez le champ jeton.",
    'token-short': "Le jeton d'accès est requis.",
    unreachable: 'Serveur injoignable : vérifiez l’adresse, le port et votre connexion.',
    timeout: 'Le serveur ne répond pas (délai dépassé).',
    tls: 'Certificat HTTPS refusé ou invalide : connexion annulée.',
    'not-geneoapp': 'Ce serveur ne ressemble pas à GeneoApp (réponse de santé inattendue).',
    unauthorized: "Jeton d'accès refusé par le serveur.",
    'server-error': 'Le serveur a répondu par une erreur ({status}).',
    insecure:
      'Attention : connexion HTTP non chiffrée vers un hôte non local. Le jeton et vos données transiteront en clair ; préférez HTTPS.',
    ok: 'Connexion réussie.',
  },
  en: {
    'url-empty': 'Enter the server address.',
    'url-invalid': 'Invalid server address (example: https://geneo.example.com).',
    'url-scheme': 'The address must start with https:// or http://.',
    'url-credentials': 'Do not put credentials in the address; use the token field.',
    'token-short': 'The access token is required.',
    unreachable: 'Server unreachable: check the address, port and your connection.',
    timeout: 'The server is not responding (timed out).',
    tls: 'HTTPS certificate rejected or invalid: connection cancelled.',
    'not-geneoapp': 'This server does not look like GeneoApp (unexpected health response).',
    unauthorized: 'Access token rejected by the server.',
    'server-error': 'The server answered with an error ({status}).',
    insecure:
      'Warning: unencrypted HTTP connection to a non-local host. The token and your data will travel in clear text; prefer HTTPS.',
    ok: 'Connection successful.',
  },
};

export function describeCode(code, locale = 'fr', params = {}) {
  const table = MESSAGES[String(locale).toLowerCase().startsWith('en') ? 'en' : 'fr'];
  return (table[code] ?? code).replace('{status}', params.status ?? '');
}

function classifyFetchError(error) {
  const cause = `${error?.cause?.code ?? ''} ${error?.cause?.message ?? ''} ${error?.message ?? ''}`;
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return 'timeout';
  if (/CERT|TLS|SSL|self.signed|issuer/i.test(cause)) return 'tls';
  return 'unreachable';
}

/**
 * Teste le serveur : GET /health (public) puis GET /api/trees avec le jeton.
 * Renvoie `{ ok, code, status?, insecure?, url? }`.
 */
export async function testConnection({ url, token, fetchImpl = fetch, timeoutMs = 8000 }) {
  const target = normalizeServerUrl(url);
  if (target.error) return { ok: false, code: target.error };
  const request = (route, headers = {}) =>
    fetchImpl(`${target.url}${route}`, {
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
  try {
    const health = await request('/health');
    if (!health.ok) return { ok: false, code: 'not-geneoapp', status: health.status };
    const body = await health.json().catch(() => null);
    if (body?.status !== 'ok') return { ok: false, code: 'not-geneoapp' };
    const auth = await request('/api/trees', token ? { Authorization: `Bearer ${token}` } : {});
    if (auth.status === 401 || auth.status === 403 || (auth.status >= 300 && auth.status < 400)) {
      return { ok: false, code: token ? 'unauthorized' : 'token-short', status: auth.status };
    }
    if (auth.status >= 500) return { ok: false, code: 'server-error', status: auth.status };
    return { ok: true, code: 'ok', insecure: target.insecure, url: target.url };
  } catch (error) {
    return { ok: false, code: classifyFetchError(error) };
  }
}

/** En-têtes de requête : ajoute le jeton seulement vers l'origine du serveur choisi. */
export function applyBearer(requestUrl, headers, { origin, token }) {
  if (!token) return headers;
  let sameOrigin = false;
  try {
    sameOrigin = new URL(requestUrl).origin === origin;
  } catch {
    sameOrigin = false;
  }
  return sameOrigin ? { ...headers, Authorization: `Bearer ${token}` } : headers;
}

/**
 * Configuration persistée (`remote-server.json` dans userData) : mode, dernière URL
 * et jeton. Le jeton est chiffré par `safeStorage` ; sans chiffrement disponible, il
 * n'est PAS enregistré (à ressaisir à chaque lancement).
 */
export function createRemoteConfigStore({ dir, safeStorage }) {
  const file = path.join(dir, 'remote-server.json');
  const canEncrypt = () => Boolean(safeStorage?.isEncryptionAvailable?.());

  function read() {
    try {
      const data = JSON.parse(readFileSync(file, 'utf8'));
      let token = '';
      if (data.token && canEncrypt()) {
        try {
          token = safeStorage.decryptString(Buffer.from(data.token, 'base64'));
        } catch {
          token = '';
        }
      }
      return {
        mode: data.mode === 'remote' ? 'remote' : 'local',
        url: typeof data.url === 'string' ? data.url : '',
        token,
        tokenStored: Boolean(token),
      };
    } catch {
      return { mode: 'local', url: '', token: '', tokenStored: false };
    }
  }

  function write({ mode, url, token }) {
    const data = { mode: mode === 'remote' ? 'remote' : 'local', url: url ?? '' };
    if (token && canEncrypt()) data.token = safeStorage.encryptString(token).toString('base64');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const temporary = `${file}.tmp`;
    writeFileSync(temporary, JSON.stringify(data), { mode: 0o600 });
    renameSync(temporary, file);
  }

  /** Revient en local en conservant la dernière adresse (le jeton est effacé). */
  function useLocal() {
    write({ mode: 'local', url: read().url, token: '' });
  }

  return { read, write, useLocal, canEncrypt };
}
