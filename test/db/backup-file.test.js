import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, writeFile, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openDatabase } from '../../src/db/src/database.js';
import { runMigrations } from '../../src/db/src/migrate.js';
import { PersonRepository } from '../../src/db/src/repositories/person-repository.js';
import {
  createSqliteFileBackup,
  listBackups,
  verifyBackup,
  restoreSqliteFileBackup,
} from '../../src/db/src/backup/backup-file.js';

async function withTempDir(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'geneoapp-backup-test-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('createSqliteFileBackup produit un fichier vérifiable et catalogué', async () => {
  await withTempDir(async (dir) => {
    const dbPath = path.join(dir, 'geneoapp.sqlite');
    const database = openDatabase(dbPath);
    runMigrations(database);
    new PersonRepository(database).create({ givenNames: 'Ada', familyName: 'Lovelace' });

    const meta = await createSqliteFileBackup(database, path.join(dir, 'backups'), {
      label: 'test',
    });

    assert.equal(meta.kind, 'sqlite');
    assert.equal(meta.label, 'test');
    assert.ok(meta.checksum.length === 64);

    const backups = await listBackups(path.join(dir, 'backups'));
    assert.equal(backups.length, 1);
    assert.equal(backups[0].filename, meta.filename);

    const verification = await verifyBackup(path.join(dir, 'backups'), meta.filename);
    assert.equal(verification.valid, true);

    database.close();
  });
});

test('createSqliteFileBackup refuse une base en mémoire', async () => {
  const database = openDatabase(':memory:');
  runMigrations(database);
  await assert.rejects(() => createSqliteFileBackup(database, '/tmp/should-not-be-created'));
  database.close();
});

test('verifyBackup détecte un fichier corrompu (somme de contrôle invalide)', async () => {
  await withTempDir(async (dir) => {
    const dbPath = path.join(dir, 'geneoapp.sqlite');
    const database = openDatabase(dbPath);
    runMigrations(database);

    const backupDir = path.join(dir, 'backups');
    const meta = await createSqliteFileBackup(database, backupDir);
    database.close();

    // Corruption post-écriture (ex. disque défaillant, coupure partielle).
    await appendFile(path.join(backupDir, meta.filename), 'garbage-bytes');

    const verification = await verifyBackup(backupDir, meta.filename);
    assert.equal(verification.valid, false);
    assert.equal(verification.reason, 'checksum_mismatch');
  });
});

test('restoreSqliteFileBackup refuse de restaurer une sauvegarde invalide', async () => {
  await withTempDir(async (dir) => {
    const dbPath = path.join(dir, 'geneoapp.sqlite');
    const database = openDatabase(dbPath);
    runMigrations(database);
    const backupDir = path.join(dir, 'backups');
    const meta = await createSqliteFileBackup(database, backupDir);
    database.close();

    await writeFile(path.join(backupDir, meta.filename), 'not-a-sqlite-file');

    await assert.rejects(() => restoreSqliteFileBackup(backupDir, meta.filename, dbPath));
  });
});

test('restoreSqliteFileBackup remplace atomiquement le fichier cible et son contenu redevient lisible', async () => {
  await withTempDir(async (dir) => {
    const dbPath = path.join(dir, 'geneoapp.sqlite');
    let database = openDatabase(dbPath);
    runMigrations(database);
    new PersonRepository(database).create({ givenNames: 'Ada', familyName: 'Lovelace' });

    const backupDir = path.join(dir, 'backups');
    const meta = await createSqliteFileBackup(database, backupDir);

    // Modification postérieure à la sauvegarde : doit disparaître après restauration.
    new PersonRepository(database).create({ givenNames: 'Bob', familyName: 'Builder' });
    database.close();

    await restoreSqliteFileBackup(backupDir, meta.filename, dbPath);

    database = openDatabase(dbPath);
    const persons = new PersonRepository(database).list();
    assert.equal(persons.length, 1);
    assert.equal(persons[0].given_names, 'Ada');
    database.close();
  });
});

test('deux sauvegardes successives produisent des fichiers distincts et valides', async () => {
  await withTempDir(async (dir) => {
    const dbPath = path.join(dir, 'geneoapp.sqlite');
    const database = openDatabase(dbPath);
    runMigrations(database);
    const backupDir = path.join(dir, 'backups');

    const results = await Promise.all([
      createSqliteFileBackup(database, backupDir, { label: 'a' }),
      createSqliteFileBackup(database, backupDir, { label: 'b' }),
    ]);

    assert.notEqual(results[0].filename, results[1].filename);
    for (const meta of results) {
      const verification = await verifyBackup(backupDir, meta.filename);
      assert.equal(verification.valid, true);
    }

    database.close();
  });
});
