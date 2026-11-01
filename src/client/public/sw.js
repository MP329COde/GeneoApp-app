/* Service worker minimal de GeneoApp (mode web installable).
 *
 * Il ne met en cache QUE le shell statique : la page hors ligne, le manifeste,
 * les icônes et les fichiers compilés de /assets/ (noms à empreinte, sans aucune
 * donnée généalogique). Jamais d'API (/api), jamais la page HTML de
 * l'application, jamais de requête non GET ni inter-origines : les données
 * restent toujours lues sur le serveur. */
const CACHE = 'geneoapp-shell-v1';
const OFFLINE_URL = 'offline.html';
const PRECACHE = [OFFLINE_URL, 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  const scope = new URL(self.registration.scope).pathname;
  return url.pathname.startsWith(`${scope}assets/`);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Navigation : toujours le réseau ; la page hors ligne n'apparaît qu'en cas d'échec.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches
          .match(new URL(OFFLINE_URL, self.registration.scope).href)
          .then((cached) => cached || Response.error()),
      ),
    );
    return;
  }
  // Tout ce qui n'est pas un fichier compilé (dont /api) passe directement au réseau.
  if (!isStaticAsset(url)) return;
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          // Ni redirection (page de jeton) ni erreur dans le cache.
          if (response.ok && !response.redirected && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
