import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LocalAiService } from '../../src/server/src/services/local-ai.service.js';

test('analyze() refuse quand l’IA locale est désactivée, sans jamais appeler le réseau', async () => {
  const fetchImpl = () => {
    throw new Error('ne doit jamais être appelé');
  };
  const service = new LocalAiService({ enabled: false, fetchImpl });

  await assert.rejects(() => service.analyze({ prompt: 'Résume la famille' }), {
    message: 'L’IA locale est désactivée',
    status: 503,
  });
});

test('analyze() exige un prompt non vide', async () => {
  const service = new LocalAiService({ enabled: true, fetchImpl: () => {} });

  await assert.rejects(() => service.analyze({}), { status: 400 });
});

test('analyze() renvoie une erreur honnête (503) si le serveur Ollama local est injoignable', async () => {
  const fetchImpl = () => Promise.reject(new Error('ECONNREFUSED'));
  const service = new LocalAiService({
    enabled: true,
    endpoint: 'http://127.0.0.1:11434',
    fetchImpl,
  });

  await assert.rejects(() => service.analyze({ prompt: 'Résume la famille' }), { status: 503 });
});

test('analyze() renvoie la réponse réelle du serveur Ollama local quand il répond', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return {
      ok: true,
      json: async () => ({ response: 'Résumé généré localement.' }),
    };
  };
  const service = new LocalAiService({
    enabled: true,
    endpoint: 'http://127.0.0.1:11434',
    model: 'llama3',
    fetchImpl,
  });

  const result = await service.analyze({ prompt: 'Résume la famille Dupont' });

  assert.equal(result.response, 'Résumé généré localement.');
  assert.equal(result.model, 'llama3');
  assert.ok(result.generatedAt);
  assert.equal(calls[0].url, 'http://127.0.0.1:11434/api/generate');
  assert.equal(calls[0].body.prompt, 'Résume la famille Dupont');
});

test('analyze() renvoie une erreur honnête (503) si le serveur Ollama répond en erreur HTTP', async () => {
  const fetchImpl = async () => ({ ok: false, status: 500 });
  const service = new LocalAiService({ enabled: true, fetchImpl });

  await assert.rejects(() => service.analyze({ prompt: 'Résume la famille' }), { status: 503 });
});
