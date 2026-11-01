// Enregistrement du service worker (client web installable). Uniquement en
// contexte sécurisé : HTTPS ou boucle locale. Jamais en Electron (file://) ni
// en développement (le rechargement à chaud et les e2e restent intacts).
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export function canRegisterServiceWorker(location) {
  if (!location) return false;
  if (location.protocol === 'https:') return true;
  return location.protocol === 'http:' && LOOPBACK_HOSTS.has(location.hostname);
}

export function registerServiceWorker({
  nav = globalThis.navigator,
  loc = globalThis.location,
  win = globalThis.window,
} = {}) {
  if (!nav || !('serviceWorker' in nav) || !canRegisterServiceWorker(loc)) return false;
  win.addEventListener('load', () => {
    nav.serviceWorker.register('./sw.js').catch(() => {
      // L'installation est un confort : l'application fonctionne sans.
    });
  });
  return true;
}
