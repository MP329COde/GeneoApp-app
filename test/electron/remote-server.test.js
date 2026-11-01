import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  applyBearer,
  createRemoteConfigStore,
  describeCode,
  normalizeServerUrl,
  testConnection,
} from '../../src/electron/src/remote/remote-server.js';

const fakeSafeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (text) => Buffer.from(`enc:${text}`),
  decryptString: (buffer) => buffer.toString().replace(/^enc:/, ''),
};

test("normalisation de l'URL : schéma, HTTPS par défaut, avertissement HTTP non local", () => {
  assert.equal(normalizeServerUrl('geneo.example.fr/').url, 'https://geneo.example.fr');
  assert.equal(normalizeServerUrl('http://192.168.1.5:3000').insecure, true);
  assert.equal(normalizeServerUrl('http://localhost:3000').insecure, false);
  assert.equal(normalizeServerUrl('https://a.fr').insecure, false);
  assert.equal(normalizeServerUrl('').error, 'url-empty');
  assert.equal(normalizeServerUrl('ftp://a.fr').error, 'url-scheme');
  assert.equal(normalizeServerUrl('https://u:p@a.fr').error, 'url-credentials');
  assert.equal(normalizeServerUrl('https://exa mple').error, 'url-invalid');
});

test('le jeton est chiffré sur disque et la dernière URL mémorisée', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'geneo-remote-'));
  const store = createRemoteConfigStore({ dir, safeStorage: fakeSafeStorage });
  store.write({ mode: 'remote', url: 'https://a.fr', token: 'secret-token-123' });
  assert.ok(!readFileSync(path.join(dir, 'remote-server.json'), 'utf8').includes('secret-token'));
  assert.deepEqual(store.read(), {
    mode: 'remote',
    url: 'https://a.fr',
    token: 'secret-token-123',
    tokenStored: true,
  });
  store.useLocal();
  const back = store.read();
  assert.equal(back.mode, 'local');
  assert.equal(back.url, 'https://a.fr');
  assert.equal(back.token, '');
});

test('sans safeStorage, le jeton n’est jamais écrit', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'geneo-remote-'));
  const store = createRemoteConfigStore({
    dir,
    safeStorage: { isEncryptionAvailable: () => false },
  });
  store.write({ mode: 'remote', url: 'https://a.fr', token: 'secret-token-123' });
  assert.ok(!readFileSync(path.join(dir, 'remote-server.json'), 'utf8').includes('secret'));
  assert.equal(store.read().token, '');
});

test('le jeton Bearer n’est ajouté que vers l’origine du serveur', () => {
  const ctx = { origin: 'https://a.fr', token: 't' };
  assert.equal(applyBearer('https://a.fr/api/x', {}, ctx).Authorization, 'Bearer t');
  assert.equal(applyBearer('https://autre.fr/api', {}, ctx).Authorization, undefined);
  assert.equal(applyBearer('http://a.fr/api', {}, ctx).Authorization, undefined);
});

function fakeFetch(routes) {
  return async (url) => {
    const route = routes[new URL(url).pathname];
    if (route instanceof Error) throw route;
    return { ok: route.status < 400, status: route.status, json: async () => route.body };
  };
}

test('test de connexion : succès, jeton refusé, serveur étranger, injoignable, TLS', async () => {
  const good = {
    '/health': { status: 200, body: { status: 'ok' } },
    '/api/trees': { status: 200 },
  };
  const run = (routes, token = 't') =>
    testConnection({ url: 'https://a.fr', token, fetchImpl: fakeFetch(routes) });
  assert.equal((await run(good)).ok, true);
  assert.equal((await run({ ...good, '/api/trees': { status: 401 } })).code, 'unauthorized');
  assert.equal((await run({ '/health': { status: 200, body: { x: 1 } } })).code, 'not-geneoapp');
  assert.equal((await run({ '/health': { status: 404 } })).code, 'not-geneoapp');
  assert.equal((await run({ '/health': new Error('fetch failed') })).code, 'unreachable');
  const tls = Object.assign(new Error('fetch failed'), { cause: { code: 'CERT_HAS_EXPIRED' } });
  assert.equal((await run({ '/health': tls })).code, 'tls');
  assert.equal((await testConnection({ url: '', token: 't' })).code, 'url-empty');
});

test('messages d’erreur en français et en anglais', () => {
  assert.match(describeCode('unauthorized', 'fr-FR'), /Jeton/);
  assert.match(describeCode('unauthorized', 'en-US'), /token/);
  assert.match(describeCode('server-error', 'en', { status: 502 }), /502/);
});
