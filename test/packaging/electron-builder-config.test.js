import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';

const configPath = fileURLToPath(new URL('../../electron-builder.yml', import.meta.url));

async function loadConfig() {
  const raw = await readFile(configPath, 'utf8');
  return load(raw);
}

test("la configuration electron-builder définit une cible pour chaque OS attendu par l'ADR 0005", async () => {
  const config = await loadConfig();

  assert.ok(config.appId, 'appId manquant');
  assert.ok(config.productName, 'productName manquant');
  assert.ok(Array.isArray(config.mac?.target) && config.mac.target.length > 0);
  assert.ok(Array.isArray(config.win?.target) && config.win.target.length > 0);
  assert.ok(Array.isArray(config.linux?.target) && config.linux.target.length > 0);
});

test('le binding natif better-sqlite3 est exclu de l’archive asar', async () => {
  const config = await loadConfig();

  assert.ok(
    config.asarUnpack?.includes('node_modules/better-sqlite3/**'),
    'better-sqlite3 doit être dans asarUnpack pour rester chargeable au runtime',
  );
});

test('les sources et tests ne sont pas embarqués dans le paquet distribué', async () => {
  const config = await loadConfig();

  assert.ok(config.files.includes('!src/client/src/**'));
  assert.ok(config.files.includes('!**/*.test.js'));
});
