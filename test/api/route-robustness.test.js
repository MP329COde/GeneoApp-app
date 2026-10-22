import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { stopOcr } from '../../src/server/src/indexing/content-extract.js';
import { startTestServer } from './helpers.js';

after(() => stopOcr());

const ROUTES_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'src',
  'server',
  'src',
  'routes',
);

// Routes exclues du test de robustesse : elles touchent au réseau, au disque
// hors du jeu de test ou à la session (testées à part).
const EXCLUDED_PREFIXES = [
  '/api/storage',
  '/api/indexing',
  '/api/ai',
  '/api/backups',
  '/api/accounts',
];

/** Routes déclarées (méthode, chemin) d'après les fichiers de routes et leur montage. */
function declaredRoutes() {
  const index = readFileSync(path.join(ROUTES_DIR, 'index.js'), 'utf8');
  const prefixes = new Map();
  for (const match of index.matchAll(/router\.use\('(\/[^']*)',\s*(\w+)Routes\(/g)) {
    prefixes.set(match[2], match[1]);
  }
  const routes = [];
  for (const file of readdirSync(ROUTES_DIR)) {
    const match = /^(.*)\.routes\.js$/.exec(file);
    if (!match) continue;
    const name = match[1].replace(/-(\w)/g, (_, c) => c.toUpperCase());
    const prefix = prefixes.get(name);
    if (prefix === undefined) continue;
    const source = readFileSync(path.join(ROUTES_DIR, file), 'utf8');
    for (const route of source.matchAll(/router\.(get|post|put|patch|delete)\(\s*'([^']*)'/g)) {
      routes.push({
        method: route[1].toUpperCase(),
        path: `/api${prefix}${route[2]}`.replace(/\/$/, ''),
      });
    }
  }
  return routes.filter(
    (route) => !EXCLUDED_PREFIXES.some((prefix) => route.path.startsWith(prefix)),
  );
}

const BODIES = [
  undefined,
  {},
  { id: 'x', name: 12, scheme: [], value: {} },
  { personIds: 'x', partnerIds: [1] },
  [],
];
const PARAM_VALUES = ['999999', 'abc', '-1', '0', '1', '2'];

test('aucune route ne répond 500 ni ne fuit de détail interne face à des entrées invalides', async () => {
  const routes = declaredRoutes();
  assert.ok(routes.length > 100, `routes détectées : ${routes.length}`);
  const server = await startTestServer();
  const failures = [];
  try {
    // Quelques données réelles (identifiants 1 et 2) : les routes atteignent leur
    // logique métier au lieu de s'arrêter à « introuvable ».
    const seed = (path, body) =>
      fetch(`${server.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    await seed('/api/persons', { givenNames: 'Ada', familyName: 'Lovelace' });
    await seed('/api/persons', { givenNames: 'Byron', familyName: 'Lovelace' });
    await seed('/api/places', { name: 'Londres' });
    await seed('/api/sources', { title: 'Registre' });
    await seed('/api/events', {
      type: 'BIRTH',
      participants: [{ personId: 1, role: 'PRINCIPAL' }],
    });
    await seed('/api/unions', { partnerIds: [1, 2] });
    await seed('/api/parentages', { childId: 1, parentId: 2 });
    await seed('/api/assertions', { entityType: 'PERSON', entityId: 1, field: 'sex', value: 'F' });
    await seed('/api/notes', { entityType: 'PERSON', entityId: 1, body: 'note' });
    await seed('/api/notebook', { title: 'Piste', content: 'x' });
    for (const route of routes) {
      const mutating = route.method !== 'GET';
      for (const value of PARAM_VALUES) {
        const url = route.path.replace(/:\w+/g, value);
        for (const body of mutating ? BODIES : [undefined]) {
          const response = await fetch(
            `${server.baseUrl}${url}${route.method === 'GET' ? '?depth=x&limit=-5&q=%00' : ''}`,
            {
              method: route.method,
              headers: { 'content-type': 'application/json' },
              body: body === undefined ? undefined : JSON.stringify(body),
            },
          );
          const text = await response.text();
          if (response.status >= 500 && response.status !== 503) {
            failures.push(`${route.method} ${url} ${JSON.stringify(body)} → ${response.status}`);
          }
          if (/\bat .*\.js:\d+|SQLITE_|node_modules/.test(text)) {
            failures.push(`${route.method} ${url} fuit un détail interne : ${text.slice(0, 120)}`);
          }
        }
      }
    }
  } finally {
    await server.close();
  }
  assert.deepEqual([...new Set(failures)].slice(0, 40), [], `${failures.length} échec(s)`);
});
