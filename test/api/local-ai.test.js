import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { stopOcr } from '../../src/server/src/indexing/content-extract.js';
import { startTestServer, requestJson } from './helpers.js';

after(() => stopOcr());

// Faux serveur Ollama : aucun modèle n'est nécessaire, ni dans la CI ni ici.
function fakeOllama(answer) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, body: options.body ? JSON.parse(options.body) : null });
    if (url.endsWith('/api/tags'))
      return { ok: true, json: async () => ({ models: [{ name: 'test-model' }] }) };
    return {
      ok: true,
      json: async () => ({
        response: typeof answer === 'function' ? answer(calls.at(-1).body) : answer,
      }),
    };
  };
  return { fetchImpl, calls };
}

const enable = (server, body = {}) =>
  requestJson(server.baseUrl, '/api/ai/config', {
    method: 'PUT',
    body: { enabled: true, ...body },
  });

test('par défaut : désactivée, état propre, aucun appel réseau, 503 explicite', async () => {
  const server = await startTestServer();
  try {
    const fake = fakeOllama('{}');
    server.services.localAi.fetchImpl = fake.fetchImpl;
    const status = await requestJson(server.baseUrl, '/api/ai/status');
    assert.equal(status.status, 200);
    assert.equal(status.body.state, 'DISABLED');
    assert.equal(status.body.enabled, false);
    assert.deepEqual(status.body.models, []);
    assert.equal(status.body.prompts.length, 4);
    const suggest = await requestJson(server.baseUrl, '/api/ai/suggest', {
      method: 'POST',
      body: { task: 'analyze-note', id: 1 },
    });
    assert.equal(suggest.status, 503);
    assert.equal(fake.calls.length, 0, 'aucun appel réseau quand l’IA est désactivée');
  } finally {
    await server.close();
  }
});

test('réglages : activation, fournisseur, validation et refus d’un serveur distant', async () => {
  const server = await startTestServer();
  try {
    const fake = fakeOllama('{}');
    server.services.localAi.fetchImpl = fake.fetchImpl;
    const ready = await enable(server, { model: 'test-model' });
    assert.equal(ready.status, 200, JSON.stringify(ready.body));
    assert.equal(ready.body.state, 'READY');
    assert.deepEqual(ready.body.models, ['test-model']);

    for (const body of [
      { endpoint: 'https://api.exemple.com' },
      { provider: 'CLOUD' },
      { enabled: 'oui' },
      { model: 'x'.repeat(300) },
    ]) {
      const refused = await requestJson(server.baseUrl, '/api/ai/config', { method: 'PUT', body });
      assert.equal(refused.status, 400, JSON.stringify(body));
    }
    const lm = await requestJson(server.baseUrl, '/api/ai/config', {
      method: 'PUT',
      body: { provider: 'OPENAI_COMPATIBLE', endpoint: 'http://localhost:1234' },
    });
    assert.equal(lm.body.provider, 'OPENAI_COMPATIBLE');
    assert.equal(lm.body.endpoint, 'http://localhost:1234');
  } finally {
    await server.close();
  }
});

test('état injoignable : décrit honnêtement, sans erreur', async () => {
  const server = await startTestServer();
  try {
    server.services.localAi.fetchImpl = () => Promise.reject(new Error('ECONNREFUSED'));
    await enable(server);
    const status = await requestJson(server.baseUrl, '/api/ai/status');
    assert.equal(status.status, 200);
    assert.equal(status.body.state, 'UNREACHABLE');
    assert.match(status.body.reason, /injoignable/);
  } finally {
    await server.close();
  }
});

test('suggestions d’une note : fondées ou non, jamais appliquées, rien d’écrit en base', async () => {
  const server = await startTestServer();
  try {
    const person = (
      await requestJson(server.baseUrl, '/api/persons', {
        method: 'POST',
        body: { givenNames: 'Pierre', familyName: 'Martin' },
      })
    ).body;
    const note = (
      await requestJson(server.baseUrl, '/api/notes', {
        method: 'POST',
        body: {
          entityType: 'PERSON',
          entityId: person.id,
          title: 'Naissance',
          body: 'Pierre est né le 3 mars 1815 à Lyon.',
        },
      })
    ).body;
    const fake = fakeOllama(() =>
      JSON.stringify({
        suggestions: [
          {
            kind: 'FACT',
            field: 'birth_date',
            value: '3 mars 1815',
            text: 'Naissance',
            quote: 'né le 3 mars 1815',
          },
          {
            kind: 'FACT',
            field: 'death_date',
            value: '1890',
            text: 'Décès',
            quote: 'mort en 1890',
          },
        ],
      }),
    );
    server.services.localAi.fetchImpl = fake.fetchImpl;
    await enable(server, { model: 'test-model' });

    const before = await requestJson(server.baseUrl, '/api/assertions');
    const result = await requestJson(server.baseUrl, '/api/ai/suggest', {
      method: 'POST',
      body: { task: 'analyze-note', id: note.id },
    });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(result.body.requiresHumanReview, true);
    assert.equal(result.body.promptId, 'analyze-note@1');
    assert.equal(result.body.model, 'test-model');
    assert.equal(result.body.suggestions[0].grounded, true);
    assert.equal(result.body.suggestions[1].grounded, false);
    const generation = fake.calls.find((call) => call.url.endsWith('/api/generate'));
    assert.match(generation.body.prompt, /Pierre est né le 3 mars 1815 à Lyon\./);
    assert.equal(generation.body.stream, false);

    const after = await requestJson(server.baseUrl, '/api/assertions');
    assert.deepEqual(after.body, before.body, 'aucune affirmation créée automatiquement');
  } finally {
    await server.close();
  }
});

test('sans modèle choisi : le premier modèle installé est utilisé et annoncé', async () => {
  const server = await startTestServer();
  try {
    const fake = fakeOllama('{"suggestions":[]}');
    server.services.localAi.fetchImpl = fake.fetchImpl;
    await enable(server);
    const source = (
      await requestJson(server.baseUrl, '/api/sources', {
        method: 'POST',
        body: { title: 'Registre paroissial', author: 'Curé' },
      })
    ).body;
    const result = await requestJson(server.baseUrl, '/api/ai/suggest', {
      method: 'POST',
      body: { task: 'analyze-source', id: source.id },
    });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(result.body.model, 'test-model');
    assert.deepEqual(result.body.suggestions, []);
  } finally {
    await server.close();
  }
});

test('réponse du modèle inexploitable : erreur claire, aucune suggestion inventée', async () => {
  const server = await startTestServer();
  try {
    server.services.localAi.fetchImpl = fakeOllama('Désolé, je ne peux pas.').fetchImpl;
    await enable(server, { model: 'test-model' });
    const source = (
      await requestJson(server.baseUrl, '/api/sources', {
        method: 'POST',
        body: { title: 'Registre' },
      })
    ).body;
    const result = await requestJson(server.baseUrl, '/api/ai/suggest', {
      method: 'POST',
      body: { task: 'analyze-source', id: source.id },
    });
    assert.equal(result.status, 503);
    assert.match(result.body.error.message, /inexploitable/);
  } finally {
    await server.close();
  }
});

test('contradiction : le prompt contient chaque valeur et n’en retient aucune', async () => {
  const server = await startTestServer();
  try {
    const person = (
      await requestJson(server.baseUrl, '/api/persons', {
        method: 'POST',
        body: { givenNames: 'Anne', familyName: 'Morel' },
      })
    ).body;
    for (const value of ['3 mars 1815', '5 mars 1815']) {
      const created = await requestJson(server.baseUrl, '/api/assertions', {
        method: 'POST',
        body: { entityType: 'PERSON', entityId: person.id, field: 'birth_date', value },
      });
      assert.equal(created.status, 201, JSON.stringify(created.body));
    }
    const fake = fakeOllama('{"suggestions":[{"kind":"TASK","text":"Consulter le registre"}]}');
    server.services.localAi.fetchImpl = fake.fetchImpl;
    await enable(server, { model: 'test-model' });
    const result = await requestJson(server.baseUrl, '/api/ai/suggest', {
      method: 'POST',
      body: { task: 'explain-contradiction', id: person.id, field: 'birth_date' },
    });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    const prompt = fake.calls.find((call) => call.url.endsWith('/api/generate')).body.prompt;
    assert.match(prompt, /3 mars 1815/);
    assert.match(prompt, /5 mars 1815/);
    const statuses = (
      await requestJson(server.baseUrl, `/api/assertions?entityType=PERSON&entityId=${person.id}`)
    ).body.map((a) => a.status);
    assert.deepEqual(statuses, ['PROPOSED', 'PROPOSED'], 'aucune valeur retenue automatiquement');

    const none = await requestJson(server.baseUrl, '/api/ai/suggest', {
      method: 'POST',
      body: { task: 'explain-contradiction', id: person.id, field: 'death_date' },
    });
    assert.equal(none.status, 404);
  } finally {
    await server.close();
  }
});

test('validation des requêtes de suggestion', async () => {
  const server = await startTestServer();
  try {
    server.services.localAi.fetchImpl = fakeOllama('{}').fetchImpl;
    await enable(server, { model: 'test-model' });
    for (const body of [
      {},
      { task: 'inconnue', id: 1 },
      { task: 'analyze-note' },
      { task: 'analyze-note', id: -3 },
      { task: 'explain-contradiction', id: 1 },
    ]) {
      const response = await requestJson(server.baseUrl, '/api/ai/suggest', {
        method: 'POST',
        body,
      });
      assert.ok(
        [400, 404].includes(response.status),
        `${JSON.stringify(body)} → ${response.status}`,
      );
    }
    const missing = await requestJson(server.baseUrl, '/api/ai/suggest', {
      method: 'POST',
      body: { task: 'analyze-note', id: 9999 },
    });
    assert.equal(missing.status, 404);
  } finally {
    await server.close();
  }
});
