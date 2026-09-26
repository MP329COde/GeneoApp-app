import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { stopOcr } from '../../src/server/src/indexing/content-extract.js';

after(() => stopOcr());
import { startTestServer, requestJson } from './helpers.js';

test('qualité : faits sourcés, confiance et incohérences de la personne', async () => {
  const server = await startTestServer();
  try {
    const { body: person } = await requestJson(server.baseUrl, '/api/persons', {
      method: 'POST',
      body: { givenNames: 'Jean', familyName: 'Qualité' },
    });
    const event = async (type, dateText) =>
      (
        await requestJson(server.baseUrl, '/api/events', {
          method: 'POST',
          body: { type, dateText, participants: [{ personId: person.id, role: 'PRINCIPAL' }] },
        })
      ).body;
    const birth = await event('BIRTH', '1900');
    await event('DEATH', '1850');
    const { body: source } = await requestJson(server.baseUrl, '/api/sources', {
      method: 'POST',
      body: { title: 'Registre paroissial' },
    });
    await requestJson(server.baseUrl, '/api/sources/citations', {
      method: 'POST',
      body: { sourceId: source.id, entityType: 'EVENT', entityId: birth.id, confidence: 'HIGH' },
    });

    const { status, body } = await requestJson(server.baseUrl, `/api/persons/${person.id}/quality`);
    assert.equal(status, 200);
    assert.deepEqual(body.totals, { facts: 3, sourced: 1, unsourced: 2 });
    assert.equal(body.confidence.HIGH, 1);
    assert.equal(body.issues[0].code, 'BIRTH_AFTER_DEATH');
    assert.ok(body.score >= 0 && body.score <= 4);

    const missing = await requestJson(server.baseUrl, '/api/persons/999/quality');
    assert.equal(missing.status, 404);
  } finally {
    await server.close();
  }
});
