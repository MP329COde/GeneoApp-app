import assert from 'node:assert/strict';
import { test } from 'node:test';
import { requestJson, startTestServer } from './helpers.js';

// Issue #49 : surface API des connecteurs multi-sites. Sans opt-in, les
// routes d'estimation et d'indexation répondent 403 et ne déclenchent
// aucune requête vers un site.

test('GET /api/indexing/connectors liste le catalogue sans requête réseau', async () => {
  const ctx = await startTestServer();
  try {
    const { status, body } = await requestJson(ctx.baseUrl, '/api/indexing/connectors');
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.connectors ?? body));
    const connectors = body.connectors ?? body;
    assert.ok(connectors.some((connector) => connector.id === 'geneanet'));
    assert.equal(
      connectors.every((connector) => connector.optedIn === false),
      true,
      'aucun connecteur ne doit être autorisé par défaut',
    );
  } finally {
    await ctx.close();
  }
});

test('l’estimation et l’indexation sont refusées sans opt-in (403)', async () => {
  const ctx = await startTestServer();
  try {
    const estimate = await requestJson(ctx.baseUrl, '/api/indexing/connectors/geneanet/estimate', {
      method: 'POST',
      body: { values: { nom: 'Dupont' } },
    });
    assert.equal(estimate.status, 403);
    assert.equal(estimate.body.error.code, 'CONNECTOR_NOT_OPTED_IN');
    assert.equal(estimate.body.error.translationKey, 'server.indexing.connectorNotOptedIn');

    const run = await requestJson(ctx.baseUrl, '/api/indexing/connectors/geneanet/index', {
      method: 'POST',
      body: { values: { nom: 'Dupont' } },
    });
    assert.equal(run.status, 403);
  } finally {
    await ctx.close();
  }
});

test('l’opt-in s’active et se désactive par la route dédiée', async () => {
  const ctx = await startTestServer();
  try {
    const enable = await requestJson(ctx.baseUrl, '/api/indexing/connectors/geneanet', {
      method: 'PATCH',
      body: { optedIn: true, maxPages: 5 },
    });
    assert.equal(enable.status, 200);

    const list = await requestJson(ctx.baseUrl, '/api/indexing/connectors');
    const connectors = list.body.connectors ?? list.body;
    const geneanet = connectors.find((connector) => connector.id === 'geneanet');
    assert.equal(geneanet.optedIn, true);
    assert.equal(geneanet.maxPages, 5);

    const disable = await requestJson(ctx.baseUrl, '/api/indexing/connectors/geneanet', {
      method: 'PATCH',
      body: { optedIn: false },
    });
    assert.equal(disable.status, 200);

    const after = await requestJson(ctx.baseUrl, '/api/indexing/connectors');
    const rows = after.body.connectors ?? after.body;
    assert.equal(rows.find((connector) => connector.id === 'geneanet').optedIn, false);
  } finally {
    await ctx.close();
  }
});

test('un connecteur inconnu est refusé (404) et un nombre de pages hors bornes est refusé (400)', async () => {
  const ctx = await startTestServer();
  try {
    const unknown = await requestJson(ctx.baseUrl, '/api/indexing/connectors/inconnu', {
      method: 'PATCH',
      body: { optedIn: true },
    });
    assert.equal(unknown.status, 404);

    const invalid = await requestJson(ctx.baseUrl, '/api/indexing/connectors/geneanet', {
      method: 'PATCH',
      body: { maxPages: 100000 },
    });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.error.code, 'INVALID');
    assert.equal(invalid.body.error.fields.maxPages.code, 'INVALID');
  } finally {
    await ctx.close();
  }
});
