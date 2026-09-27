import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { createLocalHttpGuard } from '../../src/electron/src/security/local-http-guard.js';

async function startGuardedServer(token) {
  const app = express();
  app.use(createLocalHttpGuard(token));
  app.get('/health', (_request, response) => response.json({ status: 'ok' }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  return {
    port,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

test('rejette une requête sans jeton', async () => {
  const server = await startGuardedServer('secret-token');
  try {
    const response = await fetch(`http://127.0.0.1:${server.port}/health`);
    assert.equal(response.status, 401);
  } finally {
    await server.close();
  }
});

test('rejette une requête avec un jeton incorrect', async () => {
  const server = await startGuardedServer('secret-token');
  try {
    const response = await fetch(`http://127.0.0.1:${server.port}/health`, {
      headers: { 'x-geneoapp-token': 'wrong' },
    });
    assert.equal(response.status, 401);
  } finally {
    await server.close();
  }
});

test('accepte une requête avec le bon jeton', async () => {
  const server = await startGuardedServer('secret-token');
  try {
    const response = await fetch(`http://127.0.0.1:${server.port}/health`, {
      headers: { 'x-geneoapp-token': 'secret-token' },
    });
    assert.equal(response.status, 200);
  } finally {
    await server.close();
  }
});
