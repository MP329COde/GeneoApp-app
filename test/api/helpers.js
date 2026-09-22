import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openDatabase } from '../../src/db/src/database.js';
import { runMigrations } from '../../src/db/src/migrate.js';
import { createApp } from '../../src/server/src/app.js';

export async function startTestServer({ databasePath = ':memory:' } = {}) {
  const database = openDatabase(databasePath);
  runMigrations(database);
  const mediaRoot = await mkdtemp(path.join(tmpdir(), 'geneoapp-media-test-'));
  const backupDir = await mkdtemp(path.join(tmpdir(), 'geneoapp-backups-test-'));
  const app = createApp({ database, mediaRoot, backupDir });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();

  return {
    database,
    mediaRoot,
    backupDir,
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
