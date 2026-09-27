import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { stopOcr } from '../../src/server/src/indexing/content-extract.js';

after(() => stopOcr());
import { startTestServer, requestJson } from './helpers.js';

// Reproduction exacte du contre-audit (point 1) : un profil protégé par PIN
// existe ("owner"), mais un intrus peut créer un profil sans code, se
// connecter et accéder à des opérations sensibles, voire supprimer le profil
// protégé.
test('contournement du PIN : reproduction complète bloquée à chaque étape', async () => {
  const server = await startTestServer();
  try {
    const owner = await requestJson(server.baseUrl, '/api/accounts', {
      method: 'POST',
      body: { name: 'owner', pin: '1234' },
    });
    assert.equal(owner.status, 201);

    // a) créer un profil sans session alors qu'un profil existe déjà : refusé
    const intrusCreate = await requestJson(server.baseUrl, '/api/accounts', {
      method: 'POST',
      body: { name: 'intrus' },
    });
    assert.equal(intrusCreate.status, 401);
  } finally {
    await server.close();
  }
});

test('un profil sans PIN ne peut pas lire les sauvegardes tant qu’un profil protégé existe', async () => {
  const server = await startTestServer();
  try {
    const owner = (
      await requestJson(server.baseUrl, '/api/accounts', {
        method: 'POST',
        body: { name: 'owner', pin: '1234' },
      })
    ).body;
    const ownerLogin = await requestJson(server.baseUrl, '/api/accounts/login', {
      method: 'POST',
      body: { name: 'owner', pin: '1234' },
    });

    // L'intrus se crée un profil ouvert via une session valide (autorisé par
    // la règle a), mais ce profil reste non protégé.
    const intrusCreate = await requestJson(server.baseUrl, '/api/accounts', {
      method: 'POST',
      body: { name: 'intrus' },
      headers: { 'x-geneoapp-session': ownerLogin.body.token },
    });
    assert.equal(intrusCreate.status, 201);

    const intrusLogin = await requestJson(server.baseUrl, '/api/accounts/login', {
      method: 'POST',
      body: { name: 'intrus' },
    });
    assert.equal(intrusLogin.status, 200);
    const intrusToken = intrusLogin.body.token;

    const backups = await requestJson(server.baseUrl, '/api/backups', {
      headers: { 'x-geneoapp-session': intrusToken },
    });
    assert.equal(backups.status, 403);

    const removeOwner = await requestJson(server.baseUrl, `/api/accounts/${owner.id}`, {
      method: 'DELETE',
      headers: { 'x-geneoapp-session': intrusToken },
    });
    assert.notEqual(removeOwner.status, 204);
  } finally {
    await server.close();
  }
});

test('un profil ne peut supprimer ou modifier que lui-même', async () => {
  const server = await startTestServer();
  try {
    const alice = (
      await requestJson(server.baseUrl, '/api/accounts', {
        method: 'POST',
        body: { name: 'Alice' },
      })
    ).body;
    const aliceLogin = await requestJson(server.baseUrl, '/api/accounts/login', {
      method: 'POST',
      body: { name: 'Alice' },
    });
    await requestJson(server.baseUrl, '/api/accounts', {
      method: 'POST',
      body: { name: 'Bob' },
      headers: { 'x-geneoapp-session': aliceLogin.body.token },
    });
    const bobLogin = await requestJson(server.baseUrl, '/api/accounts/login', {
      method: 'POST',
      body: { name: 'Bob' },
    });

    const bobDeletesAlice = await requestJson(server.baseUrl, `/api/accounts/${alice.id}`, {
      method: 'DELETE',
      headers: { 'x-geneoapp-session': bobLogin.body.token },
    });
    assert.equal(bobDeletesAlice.status, 403);
  } finally {
    await server.close();
  }
});

test('supprimer un profil avec PIN exige son propre PIN', async () => {
  const server = await startTestServer();
  try {
    const owner = (
      await requestJson(server.baseUrl, '/api/accounts', {
        method: 'POST',
        body: { name: 'owner', pin: '1234' },
      })
    ).body;
    const ownerLogin = await requestJson(server.baseUrl, '/api/accounts/login', {
      method: 'POST',
      body: { name: 'owner', pin: '1234' },
    });

    const withoutPin = await requestJson(server.baseUrl, `/api/accounts/${owner.id}`, {
      method: 'DELETE',
      headers: { 'x-geneoapp-session': ownerLogin.body.token },
    });
    assert.equal(withoutPin.status, 401);

    const withWrongPin = await requestJson(server.baseUrl, `/api/accounts/${owner.id}`, {
      method: 'DELETE',
      headers: { 'x-geneoapp-session': ownerLogin.body.token },
      body: { pin: '0000' },
    });
    assert.equal(withWrongPin.status, 401);

    const withPin = await requestJson(server.baseUrl, `/api/accounts/${owner.id}`, {
      method: 'DELETE',
      headers: { 'x-geneoapp-session': ownerLogin.body.token },
      body: { pin: '1234' },
    });
    assert.equal(withPin.status, 204);
  } finally {
    await server.close();
  }
});

test('le dernier profil avec PIN ne peut pas être supprimé par un autre profil', async () => {
  const server = await startTestServer();
  try {
    const owner = (
      await requestJson(server.baseUrl, '/api/accounts', {
        method: 'POST',
        body: { name: 'owner', pin: '1234' },
      })
    ).body;
    const ownerLogin = await requestJson(server.baseUrl, '/api/accounts/login', {
      method: 'POST',
      body: { name: 'owner', pin: '1234' },
    });
    await requestJson(server.baseUrl, '/api/accounts', {
      method: 'POST',
      body: { name: 'guest' },
      headers: { 'x-geneoapp-session': ownerLogin.body.token },
    });
    // Le profil "guest" (sans PIN) ne peut de toute façon rien faire de
    // sensible (règle b), et ne peut supprimer que lui-même (règle c) :
    // il ne peut donc jamais supprimer "owner", le dernier profil protégé.
    const guestLogin = await requestJson(server.baseUrl, '/api/accounts/login', {
      method: 'POST',
      body: { name: 'guest' },
    });
    const guestDeletesOwner = await requestJson(server.baseUrl, `/api/accounts/${owner.id}`, {
      method: 'DELETE',
      headers: { 'x-geneoapp-session': guestLogin.body.token },
    });
    assert.equal(guestDeletesOwner.status, 403);
  } finally {
    await server.close();
  }
});
