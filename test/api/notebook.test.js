import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { stopOcr } from '../../src/server/src/indexing/content-extract.js';

after(() => stopOcr());
import { startTestServer, requestJson } from './helpers.js';

async function createResearch(baseUrl, body = {}) {
  const { status, body: created } = await requestJson(baseUrl, '/api/notebook', {
    method: 'POST',
    body: {
      title: 'Mariage de Jean Dupont',
      content: 'Recherche #42',
      objective: 'Trouver son acte de mariage',
      ...body,
    },
  });
  assert.equal(status, 201);
  return created;
}

test('crée une recherche complète puis la met à jour (objectif, archives, résultat)', async () => {
  const server = await startTestServer();
  try {
    const research = await createResearch(server.baseUrl);
    assert.equal(research.objective, 'Trouver son acte de mariage');

    const updated = await requestJson(server.baseUrl, `/api/notebook/${research.id}`, {
      method: 'PATCH',
      body: {
        status: 'DONE',
        archives: 'Archives départementales de Vendée',
        result: 'Aucun résultat',
        dueDate: '2026-10-01',
      },
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.status, 'DONE');
    assert.equal(updated.body.archives, 'Archives départementales de Vendée');
    assert.equal(updated.body.due_date, '2026-10-01');
  } finally {
    await server.close();
  }
});

test('associe des preuves pour et contre à des hypothèses concurrentes', async () => {
  const server = await startTestServer();
  try {
    const research = await createResearch(server.baseUrl);
    const { body: nantes } = await requestJson(
      server.baseUrl,
      `/api/notebook/${research.id}/hypotheses`,
      { method: 'POST', body: { title: 'Jean serait né à Nantes' } },
    );
    const { body: angers } = await requestJson(
      server.baseUrl,
      `/api/notebook/${research.id}/hypotheses`,
      { method: 'POST', body: { title: 'Jean serait né à Angers' } },
    );
    await requestJson(server.baseUrl, `/api/notebook/hypotheses/${nantes.id}/evidence`, {
      method: 'POST',
      body: { stance: 'SUPPORTS', content: 'Recensement 1836 : né à Nantes' },
    });
    await requestJson(server.baseUrl, `/api/notebook/hypotheses/${angers.id}/evidence`, {
      method: 'POST',
      body: { stance: 'CONTRADICTS', content: 'Aucun baptême à Angers' },
    });
    await requestJson(server.baseUrl, `/api/notebook/hypotheses/${angers.id}`, {
      method: 'PATCH',
      body: { status: 'REJECTED' },
    });

    const { body: detail } = await requestJson(server.baseUrl, `/api/notebook/${research.id}`);
    assert.equal(detail.hypotheses.length, 2);
    assert.equal(detail.hypotheses[0].evidence[0].stance, 'SUPPORTS');
    assert.equal(detail.hypotheses[1].status, 'REJECTED');
    assert.equal(detail.hypotheses[1].evidence[0].stance, 'CONTRADICTS');
  } finally {
    await server.close();
  }
});

test('gère les tâches (priorité, échéance, statut) et les compteurs de la liste', async () => {
  const server = await startTestServer();
  try {
    const research = await createResearch(server.baseUrl);
    const { body: task } = await requestJson(server.baseUrl, `/api/notebook/${research.id}/tasks`, {
      method: 'POST',
      body: { title: 'Consulter les registres', priority: 'HIGH', dueDate: '2026-10-15' },
    });
    assert.equal(task.priority, 'HIGH');
    await requestJson(server.baseUrl, `/api/notebook/${research.id}/tasks`, {
      method: 'POST',
      body: { title: 'Écrire à la mairie' },
    });
    await requestJson(server.baseUrl, `/api/notebook/tasks/${task.id}`, {
      method: 'PATCH',
      body: { status: 'DONE' },
    });

    const { body: list } = await requestJson(server.baseUrl, '/api/notebook');
    assert.equal(list[0].task_count, 2);
    assert.equal(list[0].done_task_count, 1);

    const removed = await requestJson(server.baseUrl, `/api/notebook/tasks/${task.id}`, {
      method: 'DELETE',
    });
    assert.equal(removed.status, 204);
    const { body: detail } = await requestJson(server.baseUrl, `/api/notebook/${research.id}`);
    assert.equal(detail.tasks.length, 1);
  } finally {
    await server.close();
  }
});

test('rejette les entrées invalides du carnet', async () => {
  const server = await startTestServer();
  try {
    const research = await createResearch(server.baseUrl);
    const cases = [
      ['PATCH', `/api/notebook/${research.id}`, { status: 'PEUT-ÊTRE' }],
      ['PATCH', `/api/notebook/${research.id}`, { dueDate: '15/10/2026' }],
      ['POST', `/api/notebook/${research.id}/tasks`, { title: '' }],
      ['POST', `/api/notebook/${research.id}/hypotheses`, { title: 'x'.repeat(201) }],
      ['POST', '/api/notebook/abc/tasks', { title: 'Tâche' }],
    ];
    for (const [method, path, body] of cases) {
      const { status } = await requestJson(server.baseUrl, path, { method, body });
      assert.equal(status, 400, `${method} ${path} ${JSON.stringify(body)}`);
    }
    const missing = await requestJson(server.baseUrl, '/api/notebook/999', {});
    assert.equal(missing.status, 404);
    const missingHypothesis = await requestJson(
      server.baseUrl,
      '/api/notebook/hypotheses/999/evidence',
      { method: 'POST', body: { content: 'x' } },
    );
    assert.equal(missingHypothesis.status, 404);
  } finally {
    await server.close();
  }
});

test('la suppression d’une recherche est logique et annulable', async () => {
  const server = await startTestServer();
  try {
    const research = await createResearch(server.baseUrl);
    await requestJson(server.baseUrl, `/api/notebook/${research.id}`, { method: 'DELETE' });
    assert.deepEqual((await requestJson(server.baseUrl, '/api/notebook')).body, []);
    await requestJson(server.baseUrl, '/api/history/undo', { method: 'POST' });
    assert.equal((await requestJson(server.baseUrl, '/api/notebook')).body.length, 1);
  } finally {
    await server.close();
  }
});
