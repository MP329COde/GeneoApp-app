import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startTestServer, requestJson } from './helpers.js';

test('les écritures créent des notifications lisibles et marquables', async () => {
  const server = await startTestServer();
  try {
    await requestJson(server.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: 'Ada', familyName: 'Lovelace' },
    });

    const listed = await requestJson(server.baseUrl, '/api/notifications');
    assert.equal(listed.status, 200);
    assert.equal(listed.body.unread, 1);
    assert.equal(listed.body.items[0].title, 'Personne créée');

    const marked = await requestJson(
      server.baseUrl,
      `/api/notifications/${listed.body.items[0].id}/read`,
      { method: 'POST' },
    );
    assert.equal(marked.status, 200);
    assert.ok(marked.body.read_at);

    const after = await requestJson(server.baseUrl, '/api/notifications');
    assert.equal(after.body.unread, 0);
  } finally {
    await server.close();
  }
});
test('les alertes de vérification sont publiées une seule fois et liées à la personne', async () => {
  const server = await startTestServer();
  try {
    const alert = {
      type: 'warning',
      title: 'Doublon possible',
      message: 'Ada et Ada se ressemblent à 92 %.',
      personId: 1,
      dedupeKey: 'duplicate:1:2',
    };
    const first = await requestJson(server.baseUrl, '/api/notifications', {
      method: 'POST',
      body: { items: [alert] },
    });
    assert.equal(first.status, 201);
    assert.equal(first.body.created, 1);

    const again = await requestJson(server.baseUrl, '/api/notifications', {
      method: 'POST',
      body: { items: [alert] },
    });
    assert.equal(again.body.created, 0);

    const listed = await requestJson(server.baseUrl, '/api/notifications');
    assert.equal(listed.body.items.length, 1);
    assert.equal(listed.body.items[0].type, 'warning');
    assert.equal(listed.body.items[0].person_id, 1);
  } finally {
    await server.close();
  }
});
