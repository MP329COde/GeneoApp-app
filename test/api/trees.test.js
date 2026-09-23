import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createApp } from '../../src/server/src/app.js';
import { TreeWorkspace } from '../../src/server/src/trees/tree-workspace.js';
import { requestJson } from './helpers.js';

async function startWorkspaceServer() {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'geneoapp-trees-test-'));
  const workspace = new TreeWorkspace({
    dataDir,
    defaultDatabaseFile: path.join(dataDir, 'geneoapp.sqlite'),
  });
  const server = createApp({ workspace }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  return {
    dataDir,
    workspace,
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      workspace.close();
      await rm(dataDir, { recursive: true, force: true });
    },
  };
}

test('la base existante devient le premier arbre « Mon arbre », actif', async () => {
  const server = await startWorkspaceServer();
  try {
    const { status, body } = await requestJson(server.baseUrl, '/api/trees');
    assert.equal(status, 200);
    assert.equal(body.length, 1);
    assert.equal(body[0].id, 'default');
    assert.equal(body[0].name, 'Mon arbre');
    assert.equal(body[0].active, true);
    const catalog = JSON.parse(await readFile(path.join(server.dataDir, 'trees.json'), 'utf8'));
    assert.equal(catalog.activeId, 'default');
  } finally {
    await server.close();
  }
});

test('chaque arbre est isolé : changer d’arbre change toutes les données de l’API', async () => {
  const server = await startWorkspaceServer();
  try {
    await requestJson(server.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: 'Jean', familyName: 'Dupont' },
    });
    const created = await requestJson(server.baseUrl, '/api/trees', {
      method: 'POST',
      body: { name: 'Famille Morel', description: 'Branche maternelle' },
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.active, false);

    const activated = await requestJson(server.baseUrl, `/api/trees/${created.body.id}/activate`, {
      method: 'POST',
    });
    assert.equal(activated.body.active, true);

    const emptyTree = await requestJson(server.baseUrl, '/api/persons');
    assert.deepEqual(emptyTree.body, []);

    await requestJson(server.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: 'Anne', familyName: 'Morel' },
    });
    await requestJson(server.baseUrl, '/api/trees/default/activate', { method: 'POST' });
    const firstTree = await requestJson(server.baseUrl, '/api/persons');
    assert.deepEqual(
      firstTree.body.map((person) => person.given_names),
      ['Jean'],
    );
  } finally {
    await server.close();
  }
});

test('valide les noms et refuse les identifiants hors format (pas de traversée de chemin)', async () => {
  const server = await startWorkspaceServer();
  try {
    const empty = await requestJson(server.baseUrl, '/api/trees', {
      method: 'POST',
      body: { name: '   ' },
    });
    assert.equal(empty.status, 400);

    const tooLong = await requestJson(server.baseUrl, '/api/trees', {
      method: 'POST',
      body: { name: 'x'.repeat(81) },
    });
    assert.equal(tooLong.status, 400);

    const traversal = await requestJson(
      server.baseUrl,
      `/api/trees/${encodeURIComponent('../../etc')}/activate`,
      { method: 'POST' },
    );
    assert.equal(traversal.status, 400);

    const unknown = await requestJson(server.baseUrl, '/api/trees/inconnu/activate', {
      method: 'POST',
    });
    assert.equal(unknown.status, 404);
  } finally {
    await server.close();
  }
});

test('renomme, supprime logiquement (fichier conservé) puis restaure un arbre', async () => {
  const server = await startWorkspaceServer();
  try {
    const { body: tree } = await requestJson(server.baseUrl, '/api/trees', {
      method: 'POST',
      body: { name: 'Brouillon' },
    });
    const renamed = await requestJson(server.baseUrl, `/api/trees/${tree.id}`, {
      method: 'PATCH',
      body: { name: 'Famille Caron' },
    });
    assert.equal(renamed.body.name, 'Famille Caron');

    const activeRemoval = await requestJson(server.baseUrl, '/api/trees/default', {
      method: 'DELETE',
    });
    assert.equal(activeRemoval.status, 400, 'l’arbre ouvert ne peut pas être supprimé');

    const removed = await requestJson(server.baseUrl, `/api/trees/${tree.id}`, {
      method: 'DELETE',
    });
    assert.equal(removed.status, 200);
    assert.ok(existsSync(path.join(server.dataDir, `tree-${tree.id}.sqlite`)));
    const list = await requestJson(server.baseUrl, '/api/trees');
    assert.equal(list.body.length, 1);
    const deleted = await requestJson(server.baseUrl, '/api/trees/deleted');
    assert.equal(deleted.body[0].name, 'Famille Caron');

    await requestJson(server.baseUrl, `/api/trees/${tree.id}/restore`, { method: 'POST' });
    const restored = await requestJson(server.baseUrl, '/api/trees');
    assert.equal(restored.body.length, 2);
  } finally {
    await server.close();
  }
});

test('le catalogue persiste l’arbre actif entre deux démarrages', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'geneoapp-trees-restart-'));
  try {
    const first = new TreeWorkspace({
      dataDir,
      defaultDatabaseFile: path.join(dataDir, 'a.sqlite'),
    });
    const tree = first.create({ name: 'Second' });
    first.activate(tree.id);
    first.close();

    const second = new TreeWorkspace({
      dataDir,
      defaultDatabaseFile: path.join(dataDir, 'a.sqlite'),
    });
    assert.equal(second.active().id, tree.id);
    second.close();
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('un arbre en mémoire conserve ses données après un aller-retour entre arbres', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'geneoapp-trees-memory-'));
  const workspace = new TreeWorkspace({ dataDir, defaultDatabaseFile: ':memory:' });
  try {
    workspace.services.persons.create({ givenNames: 'Ada', familyName: 'Lovelace' });
    const other = workspace.create({ name: 'Autre' });
    workspace.activate(other.id);
    workspace.activate('default');
    assert.equal(workspace.services.persons.list().length, 1);
  } finally {
    workspace.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});
