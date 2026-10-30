import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { stopOcr } from '../../src/server/src/indexing/content-extract.js';
import { startTestServer, requestJson } from './helpers.js';
import { LoginThrottle } from '../../src/server/src/services/login-throttle.js';
import { TooManyRequestsError } from '../../src/server/src/errors.js';

after(() => stopOcr());

test('limitation des essais : suspension croissante, remise à zéro après réussite', () => {
  let clock = 1_000_000;
  const throttle = new LoginThrottle({ now: () => clock });
  for (let i = 0; i < 4; i += 1) {
    throttle.check('Alice');
    throttle.failure('Alice');
  }
  throttle.check('Alice'); // 4 échecs : encore libre
  throttle.failure('Alice'); // 5e échec : suspension de 30 s
  assert.throws(
    () => throttle.check('alice '),
    (error) => error instanceof TooManyRequestsError && error.retryAfterSeconds === 30,
    'insensible à la casse et aux espaces',
  );
  clock += 30_000;
  throttle.check('Alice');
  throttle.failure('Alice'); // 6e échec : 60 s
  assert.throws(
    () => throttle.check('Alice'),
    (error) => error.retryAfterSeconds === 60,
  );
  clock += 60_000;
  throttle.check('Alice');
  throttle.success('Alice');
  for (let i = 0; i < 4; i += 1) throttle.failure('Alice');
  throttle.check('Alice');
  // Un autre profil n'est pas affecté, et la suspension est plafonnée.
  throttle.check('Bob');
  for (let i = 0; i < 40; i += 1) throttle.failure('Charlie');
  assert.throws(
    () => throttle.check('Charlie'),
    (error) => error.retryAfterSeconds === 900,
  );
});

test('un PIN ne peut pas être deviné par essais répétés', async () => {
  const server = await startTestServer();
  try {
    const post = (path, body, headers) =>
      requestJson(server.baseUrl, path, { method: 'POST', body, headers });
    assert.equal((await post('/api/accounts', { name: 'Alice', pin: '4821' })).status, 201);

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const wrong = await post('/api/accounts/login', { name: 'Alice', pin: `000${attempt}` });
      assert.equal(wrong.status, 401, `essai ${attempt}`);
    }
    // Le bon PIN lui-même est refusé pendant la suspension.
    const locked = await fetch(`${server.baseUrl}/api/accounts/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Alice', pin: '4821' }),
    });
    assert.equal(locked.status, 429);
    assert.ok(Number(locked.headers.get('retry-after')) > 0);
    const body = await locked.json();
    assert.equal(body.error.code, 'TOO_MANY_ATTEMPTS');
    assert.ok(body.error.variables.seconds > 0);
    assert.doesNotMatch(JSON.stringify(body), /4821/);

    // Un autre profil n'est pas bloqué.
    assert.equal((await post('/api/accounts/login', { name: 'Inconnu', pin: '1' })).status, 401);
  } finally {
    await server.close();
  }
});

test('un profil inconnu est limité comme un profil existant (pas d’énumération)', async () => {
  const server = await startTestServer();
  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await requestJson(server.baseUrl, '/api/accounts/login', {
        method: 'POST',
        body: { name: 'Fantome', pin: '1234' },
      });
    }
    const sixth = await requestJson(server.baseUrl, '/api/accounts/login', {
      method: 'POST',
      body: { name: 'Fantome', pin: '1234' },
    });
    assert.equal(sixth.status, 429);
  } finally {
    await server.close();
  }
});

test('écritures refusées depuis une origine opaque ou inter-sites (CSRF)', async () => {
  const server = await startTestServer();
  try {
    const send = (method, path, headers) =>
      fetch(`${server.baseUrl}${path}`, {
        method,
        headers: { 'content-type': 'application/json', ...headers },
        body: method === 'GET' ? undefined : '{}',
      });

    // Page sandboxée : Origin « null », écriture sans prévol possible.
    assert.equal((await send('POST', '/api/history/undo', { origin: 'null' })).status, 403);
    assert.equal(
      (await send('POST', '/api/history/undo', { 'sec-fetch-site': 'cross-site' })).status,
      403,
    );
    // Origine distante : déjà refusée (anti DNS-rebinding).
    assert.equal(
      (await send('POST', '/api/history/undo', { origin: 'https://evil.example' })).status,
      421,
    );
    // Clients légitimes : sans Origin (CLI, tests), ou même origine locale.
    assert.equal((await send('POST', '/api/history/undo', {})).status, 200);
    assert.equal(
      (
        await send('POST', '/api/history/redo', {
          origin: server.baseUrl,
          'sec-fetch-site': 'same-origin',
        })
      ).status,
      200,
    );
    // Lecture : non concernée par le refus d'origine opaque.
    assert.equal((await send('GET', '/api/persons', { origin: 'null' })).status, 200);
  } finally {
    await server.close();
  }
});
