import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { stopOcr } from '../../src/server/src/indexing/content-extract.js';

after(() => stopOcr());
import { createApp } from '../../src/server/src/app.js';
import { TreeWorkspace } from '../../src/server/src/trees/tree-workspace.js';
import {
  StorageService,
  configuredDataDir,
  readStorageConfig,
} from '../../src/server/src/storage/storage-config.js';
import { requestJson } from './helpers.js';

async function start() {
  const root = await mkdtemp(path.join(tmpdir(), 'geneoapp-storage-'));
  const configDir = path.join(root, 'config');
  const workspace = new TreeWorkspace({
    dataDir: configDir,
    defaultDatabaseFile: path.join(configDir, 'geneoapp.sqlite'),
    backupDir: path.join(root, 'backups'),
    mirrorDir: () => readStorageConfig(configDir).mirrorDir,
  });
  const storage = new StorageService({ configDir, workspace });
  const server = createApp({ workspace, storage }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  await requestJson(baseUrl, '/api/accounts', { method: 'POST', body: { name: 'Alice' } });
  const { body } = await requestJson(baseUrl, '/api/accounts/login', {
    method: 'POST',
    body: { name: 'Alice' },
  });
  return {
    root,
    configDir,
    workspace,
    baseUrl,
    headers: { 'x-geneoapp-session': body.token },
    async close() {
      await new Promise((resolve) => server.close(resolve));
      workspace.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}

test('miroir : chaque sauvegarde est recopiée sur le dossier externe choisi', async () => {
  const ctx = await start();
  try {
    const usb = path.join(ctx.root, 'CLE_USB');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(usb);
    const set = await requestJson(ctx.baseUrl, '/api/storage/mirror', {
      method: 'PUT',
      headers: ctx.headers,
      body: { mirrorDir: usb },
    });
    assert.equal(set.status, 200);
    assert.equal(set.body.mirrorAvailable, true);

    const backup = await requestJson(ctx.baseUrl, '/api/backups', {
      method: 'POST',
      headers: ctx.headers,
      body: { kind: 'sqlite' },
    });
    assert.equal(backup.body.mirror.mirrored, true);
    const mirrored = await readdir(path.join(usb, 'default'));
    assert.ok(mirrored.includes(backup.body.filename));
    assert.ok(mirrored.includes(`${backup.body.filename}.meta.json`));
  } finally {
    await ctx.close();
  }
});

test('refuse un dossier relatif, absent ou un fichier, et exige une session', async () => {
  const ctx = await start();
  try {
    const file = path.join(ctx.root, 'fichier.txt');
    await writeFile(file, 'x');
    for (const mirrorDir of ['relatif/usb', path.join(ctx.root, 'absent'), file]) {
      const { status } = await requestJson(ctx.baseUrl, '/api/storage/mirror', {
        method: 'PUT',
        headers: ctx.headers,
        body: { mirrorDir },
      });
      assert.equal(status, 400, mirrorDir);
    }
    const anonymous = await requestJson(ctx.baseUrl, '/api/storage/mirror', {
      method: 'PUT',
      body: { mirrorDir: ctx.root },
    });
    assert.equal(anonymous.status, 401);
  } finally {
    await ctx.close();
  }
});

test('dossier de travail portable : copie des arbres puis réouverture depuis la clé', async () => {
  const ctx = await start();
  try {
    await requestJson(ctx.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: 'Ada', familyName: 'Lovelace' },
    });
    const usb = path.join(ctx.root, 'CLE_TRAVAIL');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(usb);
    const set = await requestJson(ctx.baseUrl, '/api/storage/data-dir', {
      method: 'PUT',
      headers: ctx.headers,
      body: { dataDir: usb },
    });
    assert.equal(set.status, 200);
    assert.equal(set.body.copied, true);
    assert.equal(set.body.restartRequired, true);
    assert.ok(existsSync(path.join(usb, 'trees.json')));
    assert.equal(configuredDataDir(ctx.configDir), usb);

    // « Redémarrage » : un nouvel espace portable ouvert sur la clé.
    const portable = new TreeWorkspace({
      dataDir: usb,
      defaultDatabaseFile: path.join(usb, 'geneoapp.sqlite'),
      portable: true,
    });
    try {
      assert.deepEqual(
        portable.services.persons.list().map((person) => person.family_name),
        ['Lovelace'],
      );
      assert.equal(
        portable.pathsFor(portable.find('default')).backups,
        path.join(usb, 'backups', 'default'),
      );
    } finally {
      portable.close();
    }
  } finally {
    await ctx.close();
  }
});
