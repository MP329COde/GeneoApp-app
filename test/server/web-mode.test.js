import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test, after } from 'node:test';
import { fileURLToPath } from 'node:url';

const serverEntry = fileURLToPath(new URL('../../src/server/src/server.js', import.meta.url));
const workDir = mkdtempSync(path.join(tmpdir(), 'geneoapp-web-test-'));
const webDir = path.join(workDir, 'dist');
mkdirSync(webDir);
writeFileSync(
  path.join(webDir, 'index.html'),
  '<!doctype html><html><body>GeneoApp web</body></html>',
);

const children = [];
after(() => {
  for (const child of children) child.kill('SIGTERM');
});

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function launch(env) {
  const child = spawn(process.execPath, [serverEntry], {
    env: { ...process.env, GENEOAPP_WEB_DIR: webDir, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));
  const exited = new Promise((resolve) => child.once('exit', (code) => resolve(code)));
  const ready = new Promise((resolve) => {
    const timer = setInterval(() => {
      if (output.includes('listening')) {
        clearInterval(timer);
        resolve(true);
      }
    }, 50);
    exited.then(() => {
      clearInterval(timer);
      resolve(false);
    });
  });
  return { child, exited, ready, output: () => output };
}

test('mode web en boucle locale : client HTML et API sur le même port', async () => {
  const port = await freePort();
  const run = launch({
    PORT: String(port),
    GENEOAPP_HOST: '127.0.0.1',
    GENEOAPP_DATA_DIR: path.join(workDir, 'data-local'),
  });
  assert.equal(await run.ready, true, run.output());
  const base = `http://127.0.0.1:${port}`;

  const page = await fetch(`${base}/`, { headers: { accept: 'text/html' } });
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html/);
  assert.match(await page.text(), /GeneoApp web/);
  assert.match(page.headers.get('content-security-policy'), /default-src 'self'/);

  const api = await fetch(`${base}/api/persons`);
  assert.equal(api.status, 200);
  assert.ok(Array.isArray(await api.json()));

  const unknown = await fetch(`${base}/api/inexistant`);
  assert.equal(unknown.status, 404);
});

test('hors boucle locale sans jeton : refus de démarrer', async () => {
  const run = launch({
    PORT: String(await freePort()),
    GENEOAPP_HOST: '0.0.0.0',
    GENEOAPP_ACCESS_TOKEN: '',
    GENEOAPP_DATA_DIR: path.join(workDir, 'data-refus'),
  });
  assert.notEqual(await run.exited, 0);
  assert.match(run.output(), /GENEOAPP_ACCESS_TOKEN/);
});

test('hors boucle locale avec jeton : accès protégé par cookie HttpOnly SameSite', async () => {
  const port = await freePort();
  const token = 'jeton-de-test-solide';
  const run = launch({
    PORT: String(port),
    GENEOAPP_HOST: '0.0.0.0',
    GENEOAPP_ACCESS_TOKEN: token,
    GENEOAPP_DATA_DIR: path.join(workDir, 'data-lan'),
  });
  assert.equal(await run.ready, true, run.output());
  const base = `http://127.0.0.1:${port}`;

  const denied = await fetch(`${base}/api/persons`);
  assert.equal(denied.status, 401);

  const redirected = await fetch(`${base}/`, {
    headers: { accept: 'text/html' },
    redirect: 'manual',
  });
  assert.equal(redirected.status, 303);
  assert.equal(redirected.headers.get('location'), '/__acces');

  const wrong = await fetch(`${base}/__acces`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'token=mauvais',
  });
  assert.equal(wrong.status, 401);

  const login = await fetch(`${base}/__acces`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `token=${token}`,
    redirect: 'manual',
  });
  assert.equal(login.status, 303);
  const setCookie = login.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Strict/i);
  const cookie = setCookie.split(';')[0];

  const allowed = await fetch(`${base}/api/persons`, { headers: { cookie } });
  assert.equal(allowed.status, 200);
  const page = await fetch(`${base}/`, { headers: { cookie, accept: 'text/html' } });
  assert.equal(page.status, 200);

  const bearer = await fetch(`${base}/api/persons`, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(bearer.status, 200);

  // La page de saisie du jeton garde son style sans autoriser de script.
  const loginPage = await fetch(`${base}/__acces`);
  const loginCsp = loginPage.headers.get('content-security-policy');
  assert.match(loginCsp, /style-src 'unsafe-inline'/);
  assert.match(loginCsp, /script-src 'self'/);

  // CSRF : une écriture inter-sites est refusée même avec le cookie.
  const csrf = await fetch(`${base}/api/persons`, {
    method: 'POST',
    headers: { cookie, origin: 'http://evil.example', 'content-type': 'application/json' },
    body: '{}',
  });
  assert.equal(csrf.status, 403);
});
