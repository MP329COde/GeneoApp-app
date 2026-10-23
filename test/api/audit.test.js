import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { stopOcr } from '../../src/server/src/indexing/content-extract.js';

after(() => stopOcr());
import { startTestServer, requestJson } from './helpers.js';

async function login(server, name = 'Alice') {
  await requestJson(server.baseUrl, '/api/accounts', { method: 'POST', body: { name } });
  const { body } = await requestJson(server.baseUrl, '/api/accounts/login', {
    method: 'POST',
    body: { name },
  });
  return body.token;
}

test('le journal d’audit retrace les modifications d’une fiche', async () => {
  const server = await startTestServer();
  try {
    const { body: person } = await requestJson(server.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: 'Ada', familyName: 'Lovelace' },
    });

    const entries = await requestJson(server.baseUrl, `/api/audit/persons/${person.id}`);
    assert.equal(entries.status, 200);
    assert.ok(entries.body.length > 0, 'la création est journalisée');
    assert.equal(entries.body[0].operation, 'INSERT');
  } finally {
    await server.close();
  }
});

test('la purge du journal d’audit exige une session protégée', async () => {
  const server = await startTestServer();
  try {
    // Sans session : refusé.
    const anonymous = await requestJson(server.baseUrl, '/api/audit/older-than', {
      method: 'DELETE',
      body: { days: 30 },
    });
    assert.ok(anonymous.status >= 400, 'une purge sans session est refusée');

    // Avec session : accepté.
    const token = await login(server);
    const purged = await requestJson(server.baseUrl, '/api/audit/older-than', {
      method: 'DELETE',
      body: { days: 30 },
      headers: { 'x-geneoapp-session': token },
    });
    assert.equal(purged.status, 200);
    assert.equal(typeof purged.body.deleted, 'number');
    assert.equal(typeof purged.body.remaining, 'number');
  } finally {
    await server.close();
  }
});

test('la purge du journal d’audit refuse un délai invalide ou excessif', async () => {
  const server = await startTestServer();
  try {
    const token = await login(server);
    const purge = (body) =>
      requestJson(server.baseUrl, '/api/audit/older-than', {
        method: 'DELETE',
        body,
        headers: { 'x-geneoapp-session': token },
      });

    // Un délai nul effacerait tout le journal : refusé.
    assert.equal((await purge({ days: 0 })).status, 400);
    assert.equal((await purge({ days: -5 })).status, 400);
    assert.equal((await purge({ days: 'beaucoup' })).status, 400);
    assert.equal((await purge({})).status, 400);

    // Au-delà de la rétention maximale : refusé.
    assert.equal((await purge({ days: 100000 })).status, 400);
  } finally {
    await server.close();
  }
});

test('la purge du journal d’audit conserve les entrées récentes', async () => {
  const server = await startTestServer();
  try {
    const { body: person } = await requestJson(server.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: 'Ada', familyName: 'Lovelace' },
    });
    const before = server.database.prepare('SELECT COUNT(*) AS count FROM audit_log').get().count;

    const token = await login(server);
    await requestJson(server.baseUrl, '/api/audit/older-than', {
      method: 'DELETE',
      body: { days: 30 },
      headers: { 'x-geneoapp-session': token },
    });

    // Les entrées créées à l'instant ne sont pas concernées par une purge
    // des entrées de plus de 30 jours : rien n'est supprimé.
    const after = server.database.prepare('SELECT COUNT(*) AS count FROM audit_log').get().count;
    assert.ok(after >= before, 'aucune entrée récente n’est supprimée');

    const entries = await requestJson(server.baseUrl, `/api/audit/persons/${person.id}`);
    assert.ok(entries.body.length > 0, 'le journal de la fiche est conservé');
  } finally {
    await server.close();
  }
});
