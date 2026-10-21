import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { stopOcr } from '../../src/server/src/indexing/content-extract.js';

after(() => stopOcr());
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
    // La notification pointe vers une personne : la clé étrangère exige
    // qu'elle existe réellement.
    const { body: person } = await requestJson(server.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: 'Ada', familyName: 'Lovelace' },
    });
    const alert = {
      type: 'warning',
      title: 'Doublon possible',
      message: 'Ada et Ada se ressemblent à 92 %.',
      personId: person.id,
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
    // La création de la personne a elle aussi produit une notification.
    const alertNotification = listed.body.items.find((item) => item.type === 'warning');
    assert.ok(alertNotification, 'l’alerte est présente');
    assert.equal(alertNotification.title, 'Doublon possible');
    assert.equal(alertNotification.person_id, person.id);
  } finally {
    await server.close();
  }
});

test('publish() plafonne à 20 notifications non lues créées par appel', async () => {
  const server = await startTestServer();
  try {
    const items = Array.from({ length: 60 }, (_, index) => ({
      type: 'warning',
      title: `Alerte ${index}`,
      message: `Message ${index}`,
      dedupeKey: `bulk:${index}`,
    }));

    const { status, body } = await requestJson(server.baseUrl, '/api/notifications', {
      method: 'POST',
      body: { items },
    });

    assert.equal(status, 201);
    assert.equal(body.created, 20);

    const listed = await requestJson(server.baseUrl, '/api/notifications?limit=100');
    assert.equal(listed.body.items.length, 20);
  } finally {
    await server.close();
  }
});

// La clé étrangère de `notifications.person_id` ne doit pas empêcher de
// vider la corbeille : une notification est un message destiné à
// l'utilisateur, pas une donnée dérivée de la personne.
test('la purge d’une personne détache ses notifications sans les supprimer', async () => {
  const server = await startTestServer();
  try {
    const { body: person } = await requestJson(server.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: 'Ada', familyName: 'Lovelace' },
    });
    await requestJson(server.baseUrl, '/api/notifications', {
      method: 'POST',
      body: {
        items: [
          {
            type: 'warning',
            title: 'Doublon possible',
            message: 'À vérifier.',
            personId: person.id,
            dedupeKey: 'duplicate:test',
          },
        ],
      },
    });

    // Suppression logique puis purge définitive.
    await requestJson(server.baseUrl, `/api/persons/${person.id}`, { method: 'DELETE' });
    await requestJson(server.baseUrl, '/api/accounts', {
      method: 'POST',
      body: { name: 'Alice' },
    });
    const token = (
      await requestJson(server.baseUrl, '/api/accounts/login', {
        method: 'POST',
        body: { name: 'Alice' },
      })
    ).body.token;
    const purge = await requestJson(server.baseUrl, `/api/trash/persons/${person.id}`, {
      method: 'DELETE',
      headers: { 'x-geneoapp-session': token },
    });
    assert.equal(purge.status, 204, 'la purge ne doit pas être bloquée par la notification');

    // La notification existe toujours, simplement sans lien.
    const listed = await requestJson(server.baseUrl, '/api/notifications');
    const notification = listed.body.items.find((item) => item.title === 'Doublon possible');
    assert.ok(notification, 'la notification est conservée');
    assert.equal(notification.person_id, null, 'la notification est détachée de la personne');
  } finally {
    await server.close();
  }
});
