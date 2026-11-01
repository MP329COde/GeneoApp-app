import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { PUBLIC_PWA_FILES } from '../../src/server/src/web/web-mode.js';

const pub = (name) => fileURLToPath(new URL(`../../src/client/public/${name}`, import.meta.url));

test('manifeste PWA : standalone, theme_color et icônes 192/512/maskable existantes', () => {
  const manifest = JSON.parse(readFileSync(pub('manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.match(manifest.theme_color, /^#[0-9a-f]{6}$/i);
  const sizes = manifest.icons.map((icon) => `${icon.sizes}:${icon.purpose}`);
  assert.deepEqual(sizes, ['192x192:any', '512x512:any', '512x512:maskable']);
  for (const icon of manifest.icons) {
    assert.ok(PUBLIC_PWA_FILES.has(`/${icon.src}`), icon.src);
    const png = readFileSync(pub(icon.src));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    const side = Number(icon.sizes.split('x')[0]);
    assert.equal(png.readUInt32BE(16), side);
    assert.equal(png.readUInt32BE(20), side);
  }
});

// Exécute le vrai sw.js dans un bac à sable avec un faux CacheStorage.
function loadWorker() {
  const handlers = {};
  const stored = [];
  const fetched = [];
  const cache = { addAll: async () => {}, put: async (request) => stored.push(request.url) };
  const scope = { addEventListener: (type, fn) => (handlers[type] = fn) };
  Object.assign(scope, {
    location: new URL('https://geneo.example/sw.js'),
    registration: { scope: 'https://geneo.example/' },
    clients: { claim: async () => {} },
    skipWaiting: async () => {},
    caches: {
      open: async () => cache,
      keys: async () => [],
      match: async () => undefined,
    },
    fetch: async (request) => {
      fetched.push(request.url);
      return {
        ok: true,
        redirected: false,
        type: 'basic',
        clone() {
          return this;
        },
      };
    },
    URL,
    Response: { error: () => 'erreur' },
  });
  scope.self = scope;
  vm.runInNewContext(readFileSync(pub('sw.js'), 'utf8'), scope);
  const dispatch = (url, { method = 'GET', mode = 'cors' } = {}) => {
    let responded = false;
    handlers.fetch({
      request: { url, method, mode },
      respondWith: (promise) => {
        responded = true;
        return Promise.resolve(promise);
      },
    });
    return responded;
  };
  return { dispatch, stored, fetched, handlers };
}

test('service worker : ne cache jamais /api, ni non GET, ni autres origines', async () => {
  const sw = loadWorker();
  assert.equal(sw.dispatch('https://geneo.example/api/persons'), false);
  assert.equal(sw.dispatch('https://geneo.example/api/trees/1/gedcom'), false);
  assert.equal(sw.dispatch('https://geneo.example/assets/app.js', { method: 'POST' }), false);
  assert.equal(sw.dispatch('https://autre.example/assets/app.js'), false);
  assert.equal(sw.dispatch('https://geneo.example/secret.json'), false);
  assert.deepEqual(sw.stored, []);
  assert.deepEqual(sw.fetched, []);
});

test('service worker : seuls les fichiers compilés /assets/ sont mis en cache', async () => {
  const sw = loadWorker();
  assert.equal(sw.dispatch('https://geneo.example/assets/index-abc.js'), true);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(sw.stored, ['https://geneo.example/assets/index-abc.js']);
  // Navigation : réseau d'abord, page hors ligne en cas d'échec, rien de stocké.
  assert.equal(sw.dispatch('https://geneo.example/', { mode: 'navigate' }), true);
  assert.deepEqual(sw.stored, ['https://geneo.example/assets/index-abc.js']);
});

test('index.html : lien manifeste et meta apple-touch', () => {
  const html = readFileSync(
    fileURLToPath(new URL('../../src/client/index.html', import.meta.url)),
    'utf8',
  );
  assert.match(html, /rel="manifest"/);
  assert.match(html, /rel="apple-touch-icon"/);
  assert.match(html, /apple-mobile-web-app-capable/);
  assert.match(html, /name="theme-color"/);
  assert.ok(PUBLIC_PWA_FILES.has('/icons/apple-touch-icon.png'));
});
