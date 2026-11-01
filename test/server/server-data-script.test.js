import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { openDatabase } from '../../src/db/src/database.js';
import { runMigrations } from '../../src/db/src/migrate.js';
import { LOCK_FILE_NAME } from '../../src/server/src/storage/data-dir-lock.js';
import { backupDataDir, restoreDataDir } from '../../scripts/server-data.js';

test('sauvegarde puis restauration du dossier de données (base + médias), ancien contenu conservé', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'geneoapp-sd-'));
  const data = path.join(root, 'data');
  try {
    mkdirSync(path.join(data, 'media'), { recursive: true });
    writeFileSync(path.join(data, 'media', 'a.txt'), 'média');
    const db = openDatabase(path.join(data, 'geneoapp.sqlite'));
    runMigrations(db);
    db.prepare("INSERT INTO persons (given_names, family_name) VALUES ('Ada','L')").run();
    // Base ouverte (serveur « en marche ») : la sauvegarde doit rester cohérente.
    const archive = path.join(root, 'out', 'save.tar.gz');
    await backupDataDir(data, archive);
    db.prepare("INSERT INTO persons (given_names, family_name) VALUES ('Bob','M')").run();
    db.close();

    const { previous } = restoreDataDir(archive, data);
    assert.ok(existsSync(previous), 'ancien contenu conservé');
    assert.equal(readFileSync(path.join(data, 'media', 'a.txt'), 'utf8'), 'média');
    const restored = openDatabase(path.join(data, 'geneoapp.sqlite'));
    assert.equal(restored.prepare('SELECT COUNT(*) AS n FROM persons').get().n, 1);
    restored.close();
    assert.equal(existsSync(path.join(data, LOCK_FILE_NAME)), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('restauration refusée tant qu’un serveur utilise le dossier', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'geneoapp-sd-'));
  const data = path.join(root, 'data');
  try {
    mkdirSync(data);
    writeFileSync(path.join(data, 'x.txt'), 'x');
    const archive = path.join(root, 's.tar.gz');
    await backupDataDir(data, archive);
    writeFileSync(path.join(data, LOCK_FILE_NAME), JSON.stringify({ pid: process.ppid }));
    assert.throws(() => restoreDataDir(archive, data), { code: 'DATA_DIR_LOCKED' });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
