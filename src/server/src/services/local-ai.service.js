import { ServiceUnavailableError, ValidationError } from '../errors.js';

const DEFAULT_ENDPOINT = process.env.GENEOAPP_LOCAL_AI_ENDPOINT ?? 'http://127.0.0.1:11434';
const DEFAULT_MODEL = process.env.GENEOAPP_LOCAL_AI_MODEL ?? 'llama3';

// Intègre un serveur IA local compatible Ollama (API /api/generate) — jamais
// d'appel réseau distant, jamais de réponse fictive : si l'IA est désactivée
// ou le serveur local injoignable, l'erreur est honnête (503).
export class LocalAiService {
  constructor({
    enabled = process.env.GENEOAPP_LOCAL_AI === 'true',
    endpoint = DEFAULT_ENDPOINT,
    model = DEFAULT_MODEL,
    fetchImpl = fetch,
  } = {}) {
    this.enabled = enabled;
    this.endpoint = endpoint;
    this.model = model;
    this.fetchImpl = fetchImpl;
  }

  async analyze(payload) {
    if (!this.enabled) throw new ServiceUnavailableError('L’IA locale est désactivée');

    const prompt = payload?.prompt;
    if (typeof prompt !== 'string' || prompt.trim() === '') {
      throw new ValidationError('prompt est obligatoire', { fields: { prompt: 'obligatoire' } });
    }

    let response;
    try {
      response = await this.fetchImpl(`${this.endpoint}/api/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: this.model, prompt, stream: false }),
      });
    } catch {
      throw new ServiceUnavailableError(`Le serveur IA locale (${this.endpoint}) est injoignable`);
    }

    if (!response.ok) {
      throw new ServiceUnavailableError(
        `Le serveur IA locale a répondu une erreur (${response.status})`,
      );
    }

    const data = await response.json();
    return {
      model: this.model,
      response: data.response ?? '',
      generatedAt: new Date().toISOString(),
    };
  }
}
