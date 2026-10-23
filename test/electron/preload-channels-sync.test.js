import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { IPC_CHANNELS } from '../../src/electron/src/ipc/channels.js';

// Un preload sandboxé (webPreferences.sandbox: true) ne peut ni faire
// `import` (ESM) ni `require()` un fichier local (son `require()` polyfillé
// ne résout que les modules Electron/Node intégrés) : IPC_CHANNELS est donc
// recopié tel quel dans preload.cjs plutôt qu'importé depuis channels.js.
// Ce test échoue si la copie diverge de la source, pour ne jamais exposer
// au renderer un canal absent de l'allowlist réelle (ou une valeur d'un
// canal différente de celle enregistrée par ipcMain).
test('IPC_CHANNELS recopié dans preload.cjs reste identique à channels.js', () => {
  const preloadPath = fileURLToPath(new URL('../../src/electron/src/preload.cjs', import.meta.url));
  const source = readFileSync(preloadPath, 'utf8');
  const match = source.match(/const IPC_CHANNELS = Object\.freeze\(\{([\s\S]*?)\n\}\);/);
  assert.ok(match, 'IPC_CHANNELS introuvable dans preload.cjs');

  const copied = {};
  for (const line of match[1].split('\n')) {
    const entry = line.match(/^\s*([A-Z_]+):\s*'([^']+)',?\s*$/);
    if (entry) copied[entry[1]] = entry[2];
  }

  assert.ok(Object.keys(copied).length > 50, 'extraction inattendue (trop peu de canaux lus)');
  assert.deepEqual(copied, IPC_CHANNELS);
});
