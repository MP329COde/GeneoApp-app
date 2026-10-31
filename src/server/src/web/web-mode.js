// Mode « web » : un seul serveur Express sert le client buildé et l'API, pour
// tester l'application dans un navigateur sans Electron (autre machine, LAN,
// conteneur). Hors boucle locale, un jeton d'accès est obligatoire.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import express from 'express';

const COOKIE_NAME = 'geneoapp_access';
const LOGIN_PATH = '/__acces';
const MIN_TOKEN_LENGTH = 12;

export function isLoopbackHost(host) {
  if (!host) return true;
  const value = String(host).toLowerCase();
  return value === 'localhost' || value === '::1' || value === '[::1]' || /^127\./.test(value);
}

/** Refuse de démarrer hors boucle locale sans jeton d'accès suffisant. */
export function assertWebAccessConfig({ host, accessToken }) {
  if (isLoopbackHost(host)) return;
  if (!accessToken || accessToken.length < MIN_TOKEN_LENGTH) {
    throw new Error(
      `Hôte ${host} non local : définissez GENEOAPP_ACCESS_TOKEN (au moins ${MIN_TOKEN_LENGTH} caractères) ` +
        'pour exposer GeneoApp sur le réseau, ou utilisez GENEOAPP_HOST=127.0.0.1.',
    );
  }
}

function safeEqual(a, b) {
  const left = createHash('sha256').update(String(a)).digest();
  const right = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(left, right);
}

function cookieValue(accessToken) {
  return createHmac('sha256', accessToken).update('geneoapp-web-session').digest('hex');
}

function parseCookies(header = '') {
  const cookies = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index > 0) cookies[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  }
  return cookies;
}

// CSP du client web : même politique hors ligne que le build Electron.
export const WEB_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "style-src-attr 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

function loginPage(message) {
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>GeneoApp - accès</title>
<style>body{font-family:system-ui,sans-serif;max-width:24rem;margin:4rem auto;padding:0 1rem}
input,button{font:inherit;padding:.5rem;width:100%;box-sizing:border-box;margin-top:.5rem}
.err{color:#b00020}</style></head><body>
<h1>GeneoApp</h1>
<p>Ce serveur est protégé par un jeton d'accès.</p>
${message ? `<p class="err" role="alert">${message}</p>` : ''}
<form method="post" action="${LOGIN_PATH}">
<label for="token">Jeton d'accès</label>
<input id="token" name="token" type="password" autocomplete="current-password" required autofocus>
<button type="submit">Entrer</button>
</form></body></html>`;
}

function sameOriginWrite(request) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true;
  if (request.headers['sec-fetch-site'] === 'cross-site') return false;
  const origin = request.headers.origin;
  if (origin) {
    try {
      if (new URL(origin).host !== request.headers.host) return false;
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Garde d'accès : cookie HttpOnly SameSite=Strict obtenu via la page de saisie
 * du jeton (ou en-tête Authorization: Bearer pour les scripts). Ajoute une
 * vérification d'origine sur les écritures (CSRF), l'anti DNS-rebinding étant
 * désactivé en mode réseau.
 */
export function webAccessGate({ accessToken, trustProxy = false }) {
  const expected = cookieValue(accessToken);
  const failures = new Map();
  const router = express.Router();

  const isSecure = (request) =>
    request.secure || (trustProxy && request.headers['x-forwarded-proto'] === 'https');

  router.use((request, response, next) => {
    if (!sameOriginWrite(request)) {
      return response.status(403).json({ error: 'Requête inter-sites refusée' });
    }
    next();
  });

  router.get('/health', (_request, response) => response.json({ status: 'ok' }));

  router.get(LOGIN_PATH, (_request, response) => {
    response.set('Content-Security-Policy', WEB_CONTENT_SECURITY_POLICY).type('html');
    response.set('Cache-Control', 'no-store').send(loginPage());
  });

  router.post(
    LOGIN_PATH,
    express.urlencoded({ extended: false, limit: '4kb' }),
    (request, response) => {
      const key = request.ip;
      const state = failures.get(key) ?? { count: 0, until: 0 };
      response.set('Content-Security-Policy', WEB_CONTENT_SECURITY_POLICY).type('html');
      response.set('Cache-Control', 'no-store');
      if (state.until > Date.now()) {
        return response.status(429).send(loginPage('Trop de tentatives, patientez un instant.'));
      }
      if (!safeEqual(request.body?.token ?? '', accessToken)) {
        state.count += 1;
        if (state.count >= 5) Object.assign(state, { count: 0, until: Date.now() + 30_000 });
        failures.set(key, state);
        return response.status(401).send(loginPage('Jeton incorrect.'));
      }
      failures.delete(key);
      response.cookie(COOKIE_NAME, expected, {
        httpOnly: true,
        sameSite: 'strict',
        secure: isSecure(request),
        path: '/',
      });
      response.redirect(303, '/');
    },
  );

  router.use((request, response, next) => {
    const bearer = /^Bearer (.+)$/.exec(request.headers.authorization ?? '')?.[1];
    const cookie = parseCookies(request.headers.cookie)[COOKIE_NAME];
    if ((cookie && safeEqual(cookie, expected)) || (bearer && safeEqual(bearer, accessToken))) {
      return next();
    }
    const wantsHtml =
      request.method === 'GET' && (request.headers.accept ?? '').includes('text/html');
    if (wantsHtml) return response.redirect(303, LOGIN_PATH);
    return response.status(401).json({ error: "Jeton d'accès requis" });
  });

  return router;
}

/** Sert le client buildé (assets + repli SPA sur index.html). */
export function staticClient(dir) {
  const root = path.resolve(dir);
  if (!existsSync(path.join(root, 'index.html'))) {
    throw new Error(
      `Client non buildé : ${path.join(root, 'index.html')} introuvable (npm run build).`,
    );
  }
  const router = express.Router();
  const setHeaders = (response, file) => {
    if (file.endsWith('index.html')) {
      response.set('Cache-Control', 'no-store');
      response.set('Content-Security-Policy', WEB_CONTENT_SECURITY_POLICY);
    }
  };
  router.use(express.static(root, { setHeaders, index: 'index.html' }));
  router.use((request, response, next) => {
    if (request.method !== 'GET' || request.path.startsWith('/api/')) return next();
    if (!(request.headers.accept ?? '').includes('text/html')) return next();
    setHeaders(response, 'index.html');
    response.sendFile(path.join(root, 'index.html'));
  });
  return router;
}
