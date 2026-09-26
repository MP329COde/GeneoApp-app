import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { stopOcr } from '../../src/server/src/indexing/content-extract.js';

after(() => stopOcr());
import { openDatabase } from '../../src/db/src/database.js';
import { runMigrations } from '../../src/db/src/migrate.js';
import { listBackups, verifyBackup } from '../../src/db/src/index.js';
import { AUTOMATIC_RETENTION } from '../../src/server/src/services/backup.service.js';
import { startTestServer, requestJson } from './helpers.js';

test('les sauvegardes automatiques respectent la rétention par motif', async () => {
  const server = await startTestServer();
  try {
    for (let i = 0; i < AUTOMATIC_RETENTION + 3; i += 1) {
      await server.services.backups.createAutomatic('lancement');
    }
    await server.services.backups.create({ kind: 'json', label: 'manuelle' });
    const all = await listBackups(server.backupDir);
    assert.equal(all.filter((item) => item.label === 'auto:lancement').length, AUTOMATIC_RETENTION);
    assert.equal(all.filter((item) => item.label === 'manuelle').length, 1);
    await assert.rejects(() => server.services.backups.createAutomatic('n’importe quoi'));
  } finally {
    await server.close();
  }
});

test('un import GEDCOM valide est précédé d’une sauvegarde automatique, pas un invalide', async () => {
  const server = await startTestServer();
  try {
    const invalid = await requestJson(server.baseUrl, '/api/gedcom/import', {
      method: 'POST',
      body: { gedcom: '0 HEAD\n1 GEDC\n2 VERS 99\n0 TRLR\n' },
    });
    assert.equal(invalid.status, 422);
    assert.equal((await listBackups(server.backupDir)).length, 0);

    const valid = await requestJson(server.baseUrl, '/api/gedcom/import', {
      method: 'POST',
      body: { gedcom: '0 HEAD\n1 GEDC\n2 VERS 7\n0 @I1@ INDI\n1 NAME Ada /Lovelace/\n0 TRLR\n' },
    });
    assert.equal(valid.status, 201);
    const backups = await listBackups(server.backupDir);
    assert.deepEqual(
      backups.map((item) => item.label),
      ['auto:avant-import-gedcom'],
    );
  } finally {
    await server.close();
  }
});

test('une base existante est copiée et vérifiable avant l’application de nouvelles migrations', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'geneoapp-premigration-'));
  const migrations = path.join(dir, 'migrations');
  const backups = path.join(dir, 'backups');
  const file = path.join(dir, 'base.sqlite');
  try {
    const { mkdir } = await import('node:fs/promises');
    await mkdir(migrations);
    await writeFile(
      path.join(migrations, '0001_a.sql'),
      'CREATE TABLE a (id INTEGER PRIMARY KEY);',
    );
    let database = openDatabase(file);
    runMigrations(database, { migrationsDir: migrations, backupDir: backups });
    database.close();
    assert.deepEqual(await readdir(backups).catch(() => []), [], 'base neuve : aucune copie');

    await writeFile(
      path.join(migrations, '0002_b.sql'),
      'CREATE TABLE b (id INTEGER PRIMARY KEY);',
    );
    database = openDatabase(file);
    runMigrations(database, { migrationsDir: migrations, backupDir: backups });
    database.close();

    const [backup] = await listBackups(backups);
    assert.match(backup.label, /^auto:avant-migration \(0002_b\.sql\)$/);
    const verification = await verifyBackup(backups, backup.filename);
    assert.equal(verification.valid, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
