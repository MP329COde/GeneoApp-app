import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertLocalEndpoint } from '../../src/server/src/ai/endpoint-guard.js';
import { createProvider } from '../../src/server/src/ai/providers.js';
import {
  PROMPTS,
  extractJson,
  listPrompts,
  parseSuggestions,
} from '../../src/server/src/ai/prompts.js';

test('seules les adresses de la machine ou du réseau local sont acceptées', () => {
  for (const ok of [
    'http://127.0.0.1:11434',
    'http://localhost:1234/',
    'http://[::1]:11434',
    'http://192.168.1.20:11434',
    'http://10.0.0.5',
    'http://172.20.1.1:8080',
    'http://monpc.local:11434',
  ]) {
    assert.doesNotThrow(() => assertLocalEndpoint(ok), ok);
  }
  assert.equal(assertLocalEndpoint('http://localhost:1234/v1/'), 'http://localhost:1234');
  for (const bad of [
    'https://api.openai.com',
    'http://8.8.8.8:11434',
    'http://172.32.0.1',
    'http://exemple.com',
    'ftp://127.0.0.1',
    'http://user:pass@127.0.0.1',
    'pas une adresse',
    '',
    null,
  ]) {
    assert.throws(() => assertLocalEndpoint(bad), { status: 400 }, String(bad));
  }
});

test('Ollama : liste les modèles et génère en JSON déterministe', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, body: options.body ? JSON.parse(options.body) : null });
    return {
      ok: true,
      json: async () =>
        url.endsWith('/api/tags')
          ? { models: [{ name: 'llama3:8b' }] }
          : { response: '{"suggestions":[]}' },
    };
  };
  const provider = createProvider('OLLAMA', { endpoint: 'http://127.0.0.1:11434', fetchImpl });
  assert.deepEqual(await provider.listModels(), ['llama3:8b']);
  const text = await provider.generate({
    model: 'llama3:8b',
    prompt: 'p',
    system: 's',
    json: true,
  });
  assert.equal(text, '{"suggestions":[]}');
  assert.equal(calls[1].url, 'http://127.0.0.1:11434/api/generate');
  assert.equal(calls[1].body.format, 'json');
  assert.equal(calls[1].body.stream, false);
  assert.equal(calls[1].body.options.temperature, 0);
});

test('LM Studio (compatible OpenAI) : modèles et chat/completions', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, body: options.body ? JSON.parse(options.body) : null });
    return {
      ok: true,
      json: async () =>
        url.endsWith('/v1/models')
          ? { data: [{ id: 'qwen2.5-7b' }] }
          : { choices: [{ message: { content: 'Bonjour' } }] },
    };
  };
  const provider = createProvider('OPENAI_COMPATIBLE', {
    endpoint: 'http://localhost:1234',
    fetchImpl,
  });
  assert.deepEqual(await provider.listModels(), ['qwen2.5-7b']);
  assert.equal(
    await provider.generate({ model: 'qwen2.5-7b', prompt: 'salut', system: 'sys' }),
    'Bonjour',
  );
  assert.equal(calls[1].url, 'http://localhost:1234/v1/chat/completions');
  assert.deepEqual(
    calls[1].body.messages.map((message) => message.role),
    ['system', 'user'],
  );
});

test('un serveur injoignable, en erreur ou illisible donne une erreur 503 explicite', async () => {
  const unreachable = createProvider('OLLAMA', {
    endpoint: 'http://127.0.0.1:1',
    fetchImpl: () => Promise.reject(new Error('ECONNREFUSED')),
  });
  await assert.rejects(() => unreachable.listModels(), { status: 503, message: /injoignable/ });
  const failing = createProvider('OLLAMA', {
    endpoint: 'http://127.0.0.1:1',
    fetchImpl: async () => ({ ok: false, status: 500 }),
  });
  await assert.rejects(() => failing.listModels(), { status: 503, message: /500/ });
  const garbage = createProvider('OLLAMA', {
    endpoint: 'http://127.0.0.1:1',
    fetchImpl: async () => ({
      ok: true,
      json: async () => {
        throw new Error('x');
      },
    }),
  });
  await assert.rejects(() => garbage.listModels(), { status: 503, message: /illisible/ });
});

test('prompts versionnés : chaque tâche a une version entière et une description', () => {
  const prompts = listPrompts();
  assert.deepEqual(prompts.map((prompt) => prompt.id).sort(), [
    'analyze-note',
    'analyze-source',
    'explain-contradiction',
    'suggest-research',
  ]);
  for (const prompt of prompts) {
    assert.ok(Number.isInteger(prompt.version) && prompt.version >= 1);
    assert.ok(prompt.description.length > 10);
  }
  const text = PROMPTS['analyze-note'].build({ text: 'Jean est né en 1850.' });
  assert.match(text, /Jean est né en 1850\./);
  assert.match(text, /N’inventes|n’inventes/i);
});

test('extractJson tolère les blocs de code et le texte autour', () => {
  assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
  assert.deepEqual(extractJson('Voici :\n```json\n{"a":2}\n```\nMerci'), { a: 2 });
  assert.deepEqual(extractJson('Réponse {"a":3} fin'), { a: 3 });
  assert.equal(extractJson('aucun json'), null);
  assert.equal(extractJson('{cassé'), null);
});

test('parseSuggestions : valide, borne et marque les faits non fondés', () => {
  const source = 'Pierre Martin est né le 3 mars 1815 à Lyon, fils de Jean.';
  const answer = JSON.stringify({
    suggestions: [
      {
        kind: 'FACT',
        field: 'birth_date',
        value: '3 mars 1815',
        text: 'Naissance',
        quote: 'né le 3 mars 1815',
      },
      { kind: 'FACT', field: 'death_date', value: '1900', text: 'Décès', quote: 'mort en 1900' },
      {
        kind: 'fact',
        field: 'Champ Invalide!',
        text: 'Casse tolérée',
        quote: 'NÉ LE  3 mars 1815',
      },
      { kind: 'DELETE_EVERYTHING', text: 'Type inconnu' },
      { kind: 'QUESTION', text: '' },
      'pas un objet',
      { kind: 'QUESTION', text: 'Qui est Jean ?' },
    ],
  });
  const suggestions = parseSuggestions(answer, source);
  assert.equal(suggestions.length, 4);
  assert.equal(suggestions[0].grounded, true);
  assert.equal(suggestions[1].grounded, false, 'citation absente du texte');
  assert.equal(suggestions[2].field, null, 'champ invalide ignoré');
  assert.equal(suggestions[2].grounded, true, 'comparaison insensible à la casse et aux espaces');
  assert.equal(suggestions[3].quote, null);
  assert.equal(parseSuggestions('pas de json', source), null);
  assert.equal(parseSuggestions('{"autre":1}', source), null);
  const many = JSON.stringify({
    suggestions: Array.from({ length: 40 }, (_, index) => ({
      kind: 'QUESTION',
      text: `Q${index}`,
    })),
  });
  assert.equal(parseSuggestions(many, source).length, 10);
});
