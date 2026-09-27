import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { stopOcr } from '../../src/server/src/indexing/content-extract.js';

after(() => stopOcr());
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startTestServer, requestJson } from './helpers.js';

async function fileServer() {
  const dir = await mkdtemp(path.join(tmpdir(), 'geneoapp-backup-api-'));
  return startTestServer({ databasePath: path.join(dir, 'geneoapp.sqlite') });
}

async function login(server, name = 'Alice', pin) {
  await requestJson(server.baseUrl, '/api/accounts', { method: 'POST', body: { name, pin } });
  const { body } = await requestJson(server.baseUrl, '/api/accounts/login', {
    method: 'POST',
    body: { name, pin },
  });
  return body.token;
}

test('POST /api/backups requiert une session (accès protégé)', async () => {
  const server = await fileServer();
  try {
    const { status } = await requestJson(server.baseUrl, '/api/backups', {
      method: 'POST',
      body: { kind: 'json' },
    });
    assert.equal(status, 401);
  } finally {
    await server.close();
  }
});

test('création puis listing d’une sauvegarde logique (JSON), avec session', async () => {
  const server = await fileServer();
  try {
    const token = await login(server);
    await requestJson(server.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: 'Ada', familyName: 'Lovelace' },
      headers: { 'x-geneoapp-session': token },
    });

    const created = await requestJson(server.baseUrl, '/api/backups', {
      method: 'POST',
      body: { kind: 'json', label: 'avant-import' },
      headers: { 'x-geneoapp-session': token },
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.kind, 'json');

    const list = await requestJson(server.baseUrl, '/api/backups', {
      headers: { 'x-geneoapp-session': token },
    });
    assert.equal(list.status, 200);
    assert.equal(list.body.length, 1);

    const verify = await requestJson(
      server.baseUrl,
      `/api/backups/${created.body.filename}/verify`,
      { headers: { 'x-geneoapp-session': token } },
    );
    assert.equal(verify.status, 200);
    assert.equal(verify.body.valid, true);
  } finally {
    await server.close();
  }
});

test('restauration logique réimporte le contenu et supprime les changements ultérieurs', async () => {
  const server = await fileServer();
  try {
    const token = await login(server);
    const headers = { 'x-geneoapp-session': token };

    await requestJson(server.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: 'Ada', familyName: 'Lovelace' },
      headers,
    });

    const backup = await requestJson(server.baseUrl, '/api/backups', {
      method: 'POST',
      body: { kind: 'json' },
      headers,
    });

    await requestJson(server.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: 'Bob', familyName: 'Builder' },
      headers,
    });

    const restore = await requestJson(
      server.baseUrl,
      `/api/backups/${backup.body.filename}/restore`,
      { method: 'POST', headers },
    );
    assert.equal(restore.status, 200);
    assert.equal(restore.body.restored, true);
    assert.equal(restore.body.restartRequired, false);

    const persons = await requestJson(server.baseUrl, '/api/persons');
    assert.equal(persons.body.length, 1);
    assert.equal(persons.body[0].given_names, 'Ada');
  } finally {
    await server.close();
  }
});

test('restauration refusée si la sauvegarde a été corrompue après coup', async () => {
  const server = await fileServer();
  try {
    const token = await login(server);
    const headers = { 'x-geneoapp-session': token };

    const backup = await requestJson(server.baseUrl, '/api/backups', {
      method: 'POST',
      body: { kind: 'json' },
      headers,
    });

    const { appendFile } = await import('node:fs/promises');
    await appendFile(path.join(server.backupDir, backup.body.filename), 'corruption');

    const restore = await requestJson(
      server.baseUrl,
      `/api/backups/${backup.body.filename}/restore`,
      { method: 'POST', headers },
    );
    assert.equal(restore.status, 409);
  } finally {
    await server.close();
  }
});

test('deux restaurations concurrentes sont sérialisées : une seule réussit en parallèle, l’autre est rejetée (409)', async () => {
  const server = await fileServer();
  try {
    const token = await login(server);
    const headers = { 'x-geneoapp-session': token };

    const backup = await requestJson(server.baseUrl, '/api/backups', {
      method: 'POST',
      body: { kind: 'json' },
      headers,
    });

    // Deux requêtes HTTP indépendantes ne garantissent pas d'atteindre le
    // serveur au même tick (le réseau, même en boucle locale, introduit une
    // latence non déterministe) : ce n'est donc pas un moyen fiable de tester
    // l'exclusion mutuelle elle-même. On invoque directement le service (même
    // instance que celle montée dans l'app, voir helpers.js) pour garantir un
    // véritable appel concurrent dans le même tick JavaScript.
    const results = await Promise.allSettled([
      server.services.backups.restoreLogical(backup.body.filename),
      server.services.backups.restoreLogical(backup.body.filename),
    ]);

    const outcomes = results
      .map((result) => (result.status === 'fulfilled' ? 'restored' : result.reason?.status))
      .sort();
    assert.deepEqual(outcomes, [409, 'restored']);
  } finally {
    await server.close();
  }
});

test('filename invalide (traversée de chemin) est rejeté', async () => {
  const server = await fileServer();
  try {
    const token = await login(server);
    const { status } = await requestJson(
      server.baseUrl,
      `/api/backups/${encodeURIComponent('../../etc/passwd')}/verify`,
      { headers: { 'x-geneoapp-session': token } },
    );
    assert.equal(status, 400);
  } finally {
    await server.close();
  }
});
