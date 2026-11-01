import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { LOCK_FILE_NAME, acquireDataDirLock } from '../../src/server/src/storage/data-dir-lock.js';

const tempDir = () => mkdtempSync(path.join(tmpdir(), 'geneoapp-lock-'));
const serverFile = fileURLToPath(new URL('../../src/server/src/server.js', import.meta.url));

test('verrou : une 2e acquisition par un processus vivant est refusée, la libération le rend', () => {
  const dir = tempDir();
  try {
    // Un processus vivant autre que nous : le parent de ce test.
    writeFileSync(
      path.join(dir, LOCK_FILE_NAME),
      JSON.stringify({ pid: process.ppid, startedAt: 'x' }),
    );
    assert.throws(() => acquireDataDirLock(dir), { code: 'DATA_DIR_LOCKED' });
    rmSync(path.join(dir, LOCK_FILE_NAME));
    const lock = acquireDataDirLock(dir);
    assert.equal(JSON.parse(readFileSync(lock.path, 'utf8')).pid, process.pid);
    lock.release();
    assert.equal(existsSync(lock.path), false);
    acquireDataDirLock(dir).release();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('verrou : un verrou laissé par un processus disparu est repris', () => {
  const dir = tempDir();
  try {
    writeFileSync(path.join(dir, LOCK_FILE_NAME), JSON.stringify({ pid: 2 ** 22 + 12345 }));
    const lock = acquireDataDirLock(dir);
    assert.ok(existsSync(lock.path));
    lock.release();
    writeFileSync(path.join(dir, LOCK_FILE_NAME), 'pas du json');
    acquireDataDirLock(dir).release();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function startServer(dataDir) {
  return spawn(process.execPath, [serverFile], {
    env: {
      ...process.env,
      GENEOAPP_DATA_DIR: dataDir,
      GENEOAPP_HOST: '127.0.0.1',
      GENEOAPP_DATABASE: 'geneoapp.sqlite',
      PORT: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

test('serveur réel : une 2e instance sur le même dossier de données refuse de démarrer', async () => {
  const dir = tempDir();
  const first = startServer(dir);
  try {
    await new Promise((resolve, reject) => {
      first.stdout.on('data', (chunk) => String(chunk).includes('listening') && resolve());
      first.once('exit', (code) => reject(new Error(`1er serveur arrêté (${code})`)));
    });
    const second = startServer(dir);
    let stderr = '';
    second.stderr.on('data', (chunk) => (stderr += chunk));
    const code = await new Promise((resolve) => second.once('exit', resolve));
    assert.equal(code, 1);
    assert.match(stderr, /déjà utilisé par une autre instance/);

    // Arrêt propre du 1er : le verrou est libéré.
    first.kill('SIGTERM');
    await new Promise((resolve) => first.once('exit', resolve));
    assert.equal(existsSync(path.join(dir, LOCK_FILE_NAME)), false);
  } finally {
    first.kill('SIGKILL');
    rmSync(dir, { recursive: true, force: true });
  }
});
