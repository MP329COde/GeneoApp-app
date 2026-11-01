import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { openDatabase } from '../../src/db/src/database.js';
import { runMigrations } from '../../src/db/src/migrate.js';

function withTempDb(run) {
  const dir = mkdtempSync(path.join(tmpdir(), 'geneoapp-conc-'));
  try {
    return run(path.join(dir, 'g.sqlite'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('SQLite fichier : WAL, busy_timeout et clés étrangères activés', () =>
  withTempDb((file) => {
    const db = openDatabase(file);
    assert.equal(db.pragma('journal_mode', { simple: true }), 'wal');
    assert.ok(db.pragma('busy_timeout', { simple: true }) >= 5000);
    assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
    db.close();
  }));

test('deux connexions sur le même fichier : lecture pendant une écriture, écritures sérialisées', () =>
  withTempDb((file) => {
    const a = openDatabase(file);
    runMigrations(a);
    const b = openDatabase(file);
    const insert = (db, name) =>
      db.prepare('INSERT INTO persons (given_names, family_name) VALUES (?, ?)').run(name, 'X');
    a.exec('BEGIN IMMEDIATE');
    insert(a, 'Ada');
    // En WAL, un lecteur n'est pas bloqué par l'écrivain en cours.
    assert.equal(b.prepare('SELECT COUNT(*) AS n FROM persons').get().n, 0);
    a.exec('COMMIT');
    insert(b, 'Bob');
    assert.equal(a.prepare('SELECT COUNT(*) AS n FROM persons').get().n, 2);
    a.close();
    b.close();
  }));

test('un second processus qui écrit pendant un verrou attend (busy_timeout) au lieu de SQLITE_BUSY', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'geneoapp-conc-'));
  const file = path.join(dir, 'g.sqlite');
  const db = openDatabase(file);
  runMigrations(db);
  const dbModule = new URL('../../src/db/src/database.js', import.meta.url).href;
  // Le processus enfant garde le verrou d'écriture ~600 ms puis valide.
  const child = spawn(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { openDatabase } from ${JSON.stringify(dbModule)};
       const d = openDatabase(process.argv[1]);
       d.exec('BEGIN IMMEDIATE');
       d.prepare("INSERT INTO persons (given_names, family_name) VALUES ('Enfant','Z')").run();
       console.log('locked');
       setTimeout(() => { d.exec('COMMIT'); d.close(); }, 600);`,
      file,
    ],
    { stdio: ['ignore', 'pipe', 'inherit'] },
  );
  try {
    await new Promise((resolve, reject) => {
      child.stdout.once('data', resolve);
      child.once('error', reject);
    });
    const started = Date.now();
    db.prepare("INSERT INTO persons (given_names, family_name) VALUES ('Parent','Z')").run();
    assert.ok(
      Date.now() - started >= 300,
      'a attendu la fin de la transaction de l’autre processus',
    );
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM persons').get().n, 2);
  } finally {
    child.kill();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
