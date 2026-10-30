import { ServiceUnavailableError } from '../errors.js';

export const PROVIDERS = Object.freeze(['OLLAMA', 'OPENAI_COMPATIBLE']);
const TIMEOUT_MS = 180_000;
const STATUS_TIMEOUT_MS = 4_000;

async function call(fetchImpl, endpoint, url, options, timeoutMs) {
  let response;
  try {
    response = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    throw new ServiceUnavailableError(`Le serveur IA locale (${endpoint}) est injoignable`);
  }
  if (!response.ok) {
    throw new ServiceUnavailableError(
      `Le serveur IA locale a répondu une erreur (${response.status})`,
    );
  }
  try {
    return await response.json();
  } catch {
    throw new ServiceUnavailableError('Le serveur IA locale a renvoyé une réponse illisible');
  }
}

const JSON_HEADERS = { 'content-type': 'application/json' };

// Ollama : GET /api/tags, POST /api/generate.
function ollama({ endpoint, fetchImpl }) {
  return {
    async listModels() {
      const data = await call(fetchImpl, endpoint, `${endpoint}/api/tags`, {}, STATUS_TIMEOUT_MS);
      return (data.models ?? []).map((model) => model.name).filter(Boolean);
    },
    async generate({ model, prompt, system, json }) {
      const data = await call(
        fetchImpl,
        endpoint,
        `${endpoint}/api/generate`,
        {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify({
            model,
            prompt,
            ...(system ? { system } : {}),
            ...(json ? { format: 'json' } : {}),
            stream: false,
            options: { temperature: 0 },
          }),
        },
        TIMEOUT_MS,
      );
      return data.response ?? '';
    },
  };
}

// LM Studio (et tout serveur compatible OpenAI) : GET /v1/models, POST /v1/chat/completions.
function openAiCompatible({ endpoint, fetchImpl }) {
  return {
    async listModels() {
      const data = await call(fetchImpl, endpoint, `${endpoint}/v1/models`, {}, STATUS_TIMEOUT_MS);
      return (data.data ?? []).map((model) => model.id).filter(Boolean);
    },
    async generate({ model, prompt, system }) {
      const data = await call(
        fetchImpl,
        endpoint,
        `${endpoint}/v1/chat/completions`,
        {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify({
            ...(model ? { model } : {}),
            messages: [
              ...(system ? [{ role: 'system', content: system }] : []),
              { role: 'user', content: prompt },
            ],
            temperature: 0,
            stream: false,
          }),
        },
        TIMEOUT_MS,
      );
      return data.choices?.[0]?.message?.content ?? '';
    },
  };
}

export function createProvider(kind, options) {
  if (kind === 'OPENAI_COMPATIBLE') return openAiCompatible(options);
  return ollama(options);
}
