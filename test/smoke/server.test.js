import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from '../../src/server/src/app.js';
import { openDatabase } from '../../src/db/src/database.js';
import { runMigrations } from '../../src/db/src/migrate.js';

function createTestApp() {
  const database = openDatabase(':memory:');
  runMigrations(database);
  return createApp({ database });
}

test('the local server exposes an infrastructure healthcheck', async () => {
  const server = createTestApp().listen(0, '127.0.0.1');

  try {
    await new Promise((resolve) => server.once('listening', resolve));
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/health`);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
