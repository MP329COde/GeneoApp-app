import assert from 'node:assert/strict';
import { test } from 'node:test';
import http from 'node:http';
import express from 'express';
import {
  dnsRebindingProtection,
  isLanModeEnabled,
} from '../../src/server/src/middleware/dns-rebinding-protection.js';

// On utilise une petite app express minimale plutôt que createApp() pour
// pouvoir forcer explicitement lanMode indépendamment de l'env réel du
// process qui exécute les tests, et sans dépendance à la base de données.
async function startServer({ lanMode } = {}) {
  const app = express();
  app.use(dnsRebindingProtection({ lanMode }));
  app.get('/health', (_request, response) => response.json({ status: 'ok' }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  return {
    port,
    async close() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

function rawRequest(port, { hostHeader, origin } = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: '127.0.0.1',
        port,
        path: '/health',
        method: 'GET',
        headers: {
          ...(hostHeader !== undefined ? { host: hostHeader } : {}),
          ...(origin !== undefined ? { origin } : {}),
        },
      },
      (response) => {
        let body = '';
        response.on('data', (chunk) => (body += chunk));
        response.on('end', () => resolve({ status: response.statusCode, body }));
      },
    );
    request.on('error', reject);
    request.end();
  });
}

test('isLanModeEnabled est vrai uniquement si GENEOAPP_HOST diffère de 127.0.0.1', () => {
  assert.equal(isLanModeEnabled({}), false);
  assert.equal(isLanModeEnabled({ GENEOAPP_HOST: '127.0.0.1' }), false);
  assert.equal(isLanModeEnabled({ GENEOAPP_HOST: '0.0.0.0' }), true);
});

test('rejette une requête dont le Host ne correspond pas à l’hôte local (DNS-rebinding)', async () => {
  const server = await startServer({ lanMode: false });
  try {
    const response = await rawRequest(server.port, { hostHeader: 'evil.example.com' });
    assert.equal(response.status, 421);
  } finally {
    await server.close();
  }
});

test('rejette une requête dont l’Origin ne correspond pas à l’hôte local (DNS-rebinding)', async () => {
  const server = await startServer({ lanMode: false });
  try {
    const response = await rawRequest(server.port, {
      hostHeader: `127.0.0.1:${server.port}`,
      origin: 'https://evil.example.com',
    });
    assert.equal(response.status, 421);
  } finally {
    await server.close();
  }
});

test('accepte une requête locale légitime (Host et Origin locaux)', async () => {
  const server = await startServer({ lanMode: false });
  try {
    const response = await rawRequest(server.port, {
      hostHeader: `127.0.0.1:${server.port}`,
      origin: 'http://localhost:5173',
    });
    assert.equal(response.status, 200);
  } finally {
    await server.close();
  }
});

test('mode dev:lan (GENEOAPP_HOST=0.0.0.0) désactive la vérification de l’hôte', async () => {
  const server = await startServer({ lanMode: true });
  try {
    const response = await rawRequest(server.port, { hostHeader: 'evil.example.com' });
    assert.equal(response.status, 200);
  } finally {
    await server.close();
  }
});
