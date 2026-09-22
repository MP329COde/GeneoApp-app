import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openDatabase } from '../../src/db/src/database.js';
import { runMigrations } from '../../src/db/src/migrate.js';
import { createApp } from '../../src/server/src/app.js';
import { createServices } from '../../src/server/src/services/index.js';

export async function startTestServer({ databasePath = ':memory:' } = {}) {
  const database = openDatabase(databasePath);
  runMigrations(database);
  const mediaRoot = await mkdtemp(path.join(tmpdir(), 'geneoapp-media-test-'));
  const backupDir = await mkdtemp(path.join(tmpdir(), 'geneoapp-backups-test-'));
  const services = createServices(database, { mediaRoot, backupDir });
  const app = createApp({ database, mediaRoot, backupDir, services });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();

  return {
    database,
    mediaRoot,
    backupDir,
    // Mêmes instances que celles montées dans l'app : utile pour les tests qui
    // doivent invoquer un service directement (ex. concurrence en mémoire),
    // sans dépendre de l'ordonnancement non déterministe de deux requêtes
    // HTTP indépendantes sur le réseau.
    services,
    baseUrl: `http://127.0.0.1:${port}`,
    async close() {
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      database.close();
      await rm(mediaRoot, { recursive: true, force: true });
      await rm(backupDir, { recursive: true, force: true });
    },
  };
}

export async function requestJson(baseUrl, path, { method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  return { status: response.status, body: json };
}
