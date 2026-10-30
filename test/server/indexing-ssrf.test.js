import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { openDatabase } from '../../src/db/src/database.js';
import { runMigrations } from '../../src/db/src/migrate.js';
import { IndexService } from '../../src/server/src/indexing/index.service.js';
import {
  BlockedHostError,
  assertPublicUrl,
  isBlockedAddress,
} from '../../src/server/src/indexing/net-guard.js';

// Issue #49 — sécurité de l'indexation distante : anti-SSRF (IP privées,
// loopback, redirections), taille et durée maximales, aucune donnée ni
// identifiant envoyés. Aucun accès au réseau réel : fetch simulé ou serveur
// HTTP local factice.

const PUBLIC_LOOKUP = async () => [{ address: '93.184.216.34', family: 4 }];
const LIMITS = { maxBytes: 20_000, timeoutMs: 300, minDelayMs: 0, maxRedirects: 3 };

function newService(options = {}) {
  const database = openDatabase(':memory:');
  runMigrations(database);
  const indexing = new IndexService(database, {
    ocr: null,
    crawlLimits: LIMITS,
    lookup: PUBLIC_LOOKUP,
    ...options,
  });
  indexing.updateSettings({ networkAllowed: true });
  indexing.setConnectorOptIn('geneanet', { optedIn: true });
  return indexing;
}

const htmlResponse = (body) =>
  new Response(body, { status: 200, headers: { 'content-type': 'text/html' } });

test('isBlockedAddress refuse privées, loopback, lien-local et réservées', () => {
  for (const address of [
    '127.0.0.1',
    '10.0.0.5',
    '172.16.0.1',
    '192.168.1.10',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '::1',
    '::',
    'fc00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    'pas-une-ip',
  ]) {
    assert.equal(isBlockedAddress(address), true, address);
  }
  for (const address of ['93.184.216.34', '8.8.8.8', '172.32.0.1', '2606:4700:4700::1111']) {
    assert.equal(isBlockedAddress(address), false, address);
  }
});

test('assertPublicUrl refuse localhost, IP littérales et noms résolus vers une IP privée', async () => {
  for (const href of [
    'http://localhost/',
    'http://api.localhost/',
    'http://127.0.0.1:8080/',
    'http://[::1]/',
    'http://169.254.169.254/latest/meta-data/',
    'http://192.168.0.1/',
    'http://2130706433/',
  ]) {
    await assert.rejects(
      assertPublicUrl(new URL(href), { lookup: PUBLIC_LOOKUP }),
      BlockedHostError,
      href,
    );
  }
  const rebinding = async () => [
    { address: '93.184.216.34', family: 4 },
    { address: '10.0.0.8', family: 4 },
  ];
  await assert.rejects(
    assertPublicUrl(new URL('https://exemple.org/'), { lookup: rebinding }),
    BlockedHostError,
  );
  await assert.rejects(
    assertPublicUrl(new URL('https://inconnu.exemple/'), {
      lookup: async () => {
        throw new Error('ENOTFOUND');
      },
    }),
    BlockedHostError,
  );
  await assertPublicUrl(new URL('https://exemple.org/'), { lookup: PUBLIC_LOOKUP });
});

test('un connecteur dont le nom se résout vers une IP privée n’est pas contacté', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    return htmlResponse('<p>interne</p>');
  };
  const indexing = newService({
    fetchImpl,
    lookup: async () => [{ address: '10.1.2.3', family: 4 }],
  });
  const outcome = await indexing.indexConnector('geneanet', { nom: 'Dupont' }).catch((e) => e);
  assert.deepEqual(calls, [], 'aucune requête vers une IP privée');
  assert.ok(outcome instanceof Error || outcome.indexed === 0 || outcome.refused);
});

test('serveur local (loopback) : jamais contacté par le robot de sites', async () => {
  const requests = [];
  const server = createServer((request, response) => {
    requests.push(request.url);
    response.setHeader('content-type', 'text/html');
    response.end('<p>secret interne</p>');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const indexing = newService();
  try {
    await indexing.addSource({
      kind: 'SITE',
      location: `http://127.0.0.1:${server.address().port}/`,
    });
    const run = await indexing.run('MANUAL');
    assert.equal(requests.length, 0);
    assert.equal(run.indexed, 0);
    assert.deepEqual(indexing.search('secret'), []);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('redirection vers une IP privée ou le service de métadonnées : non suivie', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url).endsWith('/robots.txt')) return new Response('', { status: 404 });
    return new Response(null, {
      status: 302,
      headers: { location: 'http://169.254.169.254/latest/meta-data/' },
    });
  };
  const indexing = newService({ fetchImpl });
  await indexing.addSource({ kind: 'SITE', location: 'https://archives.exemple.org/' });
  await indexing.run('MANUAL');
  await indexing.indexConnector('geneanet', { nom: 'Dupont' }).catch(() => {});
  assert.ok(calls.length > 0);
  assert.ok(
    calls.every((url) => !url.includes('169.254.169.254')),
    'redirection refusée',
  );
});

test('redirection vers un hôte public qui se résout en privé : non suivie', async () => {
  const calls = [];
  const lookup = async (host) =>
    host === 'interne.example'
      ? [{ address: '192.168.0.9', family: 4 }]
      : [{ address: '93.184.216.34', family: 4 }];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url).endsWith('/robots.txt')) return new Response('', { status: 404 });
    return new Response(null, {
      status: 302,
      headers: { location: 'https://interne.example/admin' },
    });
  };
  const indexing = newService({ fetchImpl, lookup });
  await indexing.indexConnector('geneanet', { nom: 'Dupont' }).catch(() => {});
  assert.ok(calls.every((url) => !url.includes('interne.example')));
});

test('taille maximale : une réponse trop volumineuse n’est pas indexée', async () => {
  const fetchImpl = async (url) => {
    if (String(url).endsWith('/robots.txt')) return new Response('', { status: 404 });
    return htmlResponse(`<p>gros document</p>${'x'.repeat(100_000)}`);
  };
  const indexing = newService({ fetchImpl });
  await indexing.addSource({ kind: 'SITE', location: 'https://archives.exemple.org/' });
  const run = await indexing.run('MANUAL');
  assert.equal(run.indexed, 0);
  assert.deepEqual(indexing.search('gros'), []);
});

test('durée maximale : un site qui ne répond pas est abandonné', async () => {
  const fetchImpl = (url, init) =>
    String(url).endsWith('/robots.txt')
      ? Promise.resolve(new Response('', { status: 404 }))
      : new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(init.signal.reason));
        });
  const indexing = newService({ fetchImpl });
  await indexing.addSource({ kind: 'SITE', location: 'https://archives.exemple.org/' });
  const started = Date.now();
  // AbortSignal.timeout n'empêche pas la fin du processus : minuterie de garde.
  const keepAlive = setInterval(() => {}, 50);
  try {
    const run = await indexing.run('MANUAL');
    assert.equal(run.indexed, 0);
    assert.ok(Date.now() - started < 5_000);
  } finally {
    clearInterval(keepAlive);
  }
});

test('aucun cookie, identifiant ni donnée supplémentaire dans les requêtes', async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url: String(url), init });
    return new Response('', { status: 404 });
  };
  const indexing = newService({ fetchImpl });
  await indexing
    .indexConnector('geneanet', {
      nom: 'Dupont',
      prenom: 'Jean',
      email: 'jean@exemple.org',
      adresse: '1 rue X',
      notes: 'privé',
    })
    .catch(() => {});
  assert.ok(seen.length > 0);
  for (const { url, init } of seen) {
    assert.doesNotMatch(url, /email|jean%40|jean@|rue|priv/i);
    assert.equal(init.credentials, 'omit');
    assert.equal(init.redirect, 'manual');
    assert.equal(init.body, undefined);
    assert.equal(init.method, undefined, 'GET uniquement');
    for (const name of ['cookie', 'authorization', 'referer']) {
      assert.equal(init.headers[name], undefined, name);
    }
  }
});
