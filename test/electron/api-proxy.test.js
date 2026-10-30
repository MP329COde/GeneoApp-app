import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { stopOcr } from '../../src/server/src/indexing/content-extract.js';
import { createApp } from '../../src/server/src/app.js';
import { createServices } from '../../src/server/src/services/index.js';
import { openDatabase } from '../../src/db/src/database.js';
import { runMigrations } from '../../src/db/src/migrate.js';
import { createLocalHttpGuard } from '../../src/electron/src/security/local-http-guard.js';
import {
  API_PREFIXES,
  createApiProxy,
  isAllowedApiPath,
} from '../../src/electron/src/ipc/api-proxy.js';
import { buildIpcHandlers } from '../../src/electron/src/ipc/build-handlers.js';
import { IPC_CHANNELS } from '../../src/electron/src/ipc/channels.js';

after(() => stopOcr());

test('la liste blanche suit exactement les préfixes montés par l’API', () => {
  const index = readFileSync(
    fileURLToPath(new URL('../../src/server/src/routes/index.js', import.meta.url)),
    'utf8',
  );
  const mounted = [...index.matchAll(/router\.use\('\/([a-z]+)',/g)].map((match) => match[1]);
  assert.deepEqual([...API_PREFIXES].sort(), [...mounted].sort());
});

test('chemins : seuls les préfixes d’API connus, sans traversée ni caractère de contrôle', () => {
  for (const ok of [
    '/api/persons',
    '/api/persons/12/ancestors?depth=3',
    '/api/unions/5/family',
    '/api/graph/path?personA=1&personB=2',
    '/api/search?q=Dupont%20Jean',
  ]) {
    assert.equal(isAllowedApiPath(ok), true, ok);
  }
  for (const bad of [
    '/api',
    '/api/',
    '/api/inconnu/1',
    '/apiary/persons',
    '/persons',
    'api/persons',
    '/api/persons/../accounts',
    '/api/persons/%2e%2e/accounts',
    '/api/persons/%2E%2E%2Faccounts',
    '/api/persons//1',
    '/api/persons\\1',
    '/api/persons/1\n/api/accounts',
    '/api/persons/1\u0000',
    'http://evil.example/api/persons',
    '//evil.example/api/persons',
    '/api/persons/' + 'a'.repeat(2100),
    42,
    null,
    undefined,
  ]) {
    assert.equal(isAllowedApiPath(bad), false, String(bad).slice(0, 50));
  }
});

test('requête relayée : jeton, session et acteur transmis, méthode et corps contrôlés', async () => {
  const calls = [];
  const proxy = createApiProxy({
    token: 'secret',
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return { status: 201, text: async () => '{"id":7}' };
    },
  });
  await assert.rejects(
    () => proxy.request({ method: 'GET', path: '/api/persons' }),
    /indisponible/,
  );
  proxy.setBaseUrl('http://127.0.0.1:4000');

  const result = await proxy.request({
    method: 'POST',
    path: '/api/persons',
    body: { givenNames: 'Ada' },
    sessionToken: 'session-1',
    actor: 'alice',
  });
  assert.deepEqual(result, { status: 201, body: { id: 7 } });
  assert.equal(calls[0].url, 'http://127.0.0.1:4000/api/persons');
  assert.equal(calls[0].init.headers['x-geneoapp-token'], 'secret');
  assert.equal(calls[0].init.headers['x-geneoapp-session'], 'session-1');
  assert.equal(calls[0].init.headers['x-geneoapp-actor'], 'alice');
  assert.equal(calls[0].init.body, '{"givenNames":"Ada"}');

  await assert.rejects(() => proxy.request({ method: 'TRACE', path: '/api/persons' }), /Méthode/);
  await assert.rejects(() => proxy.request({ method: 'GET', path: '/etc/passwd' }), /Chemin/);
  await assert.rejects(
    () => proxy.request({ method: 'GET', path: '/api/persons/../accounts' }),
    /Chemin/,
  );
  assert.equal(calls.length, 1, 'une requête refusée n’atteint jamais l’API');
});

test('de bout en bout : IPC → passerelle → API gardée par jeton, avec annulation et erreurs', async () => {
  const database = openDatabase(':memory:');
  runMigrations(database);
  const services = createServices(database);
  const guarded = express();
  guarded.use(createLocalHttpGuard('jeton-local'));
  guarded.use(createApp({ database, services }));
  const server = createServer(guarded).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const proxy = createApiProxy({ token: 'jeton-local' });
    proxy.setBaseUrl(`http://127.0.0.1:${server.address().port}`);
    const handlers = buildIpcHandlers(services, null, null, proxy);
    const call = (payload) => handlers[IPC_CHANNELS.API_REQUEST](payload);

    const created = await call({
      method: 'POST',
      path: '/api/persons',
      body: { givenNames: 'Ada', familyName: 'Lovelace' },
    });
    assert.equal(created.ok, true);
    assert.equal(created.data.status, 201);
    const id = created.data.body.id;

    const family = await call({ method: 'GET', path: `/api/persons/${id}/relations` });
    assert.equal(family.data.status, 200);
    assert.equal(family.data.body.person.given_names, 'Ada');

    // Une erreur métier de l'API est relayée avec son code HTTP, sans exception.
    const missing = await call({ method: 'GET', path: '/api/persons/9999' });
    assert.equal(missing.ok, true);
    assert.equal(missing.data.status, 404);

    // Chemin hors liste blanche et payload invalide : refus propre.
    const refused = await call({ method: 'GET', path: '/api/../etc/passwd' });
    assert.equal(refused.ok, false);
    const malformed = await handlers[IPC_CHANNELS.API_REQUEST]('pas un objet');
    assert.equal(malformed.ok, false);

    // Sans passerelle configurée, le canal refuse.
    const without = buildIpcHandlers(services)[IPC_CHANNELS.API_REQUEST];
    assert.equal((await without({ method: 'GET', path: '/api/persons' })).ok, false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    database.close();
  }
});
