import { NotFoundError, ServiceUnavailableError, fieldError } from '../errors.js';
import { requiredError } from '../validation/field-errors.js';
import { assertLocalEndpoint } from '../ai/endpoint-guard.js';
import { PROVIDERS, createProvider } from '../ai/providers.js';
import { PROMPTS, listPrompts, parseSuggestions } from '../ai/prompts.js';

const DEFAULT_ENDPOINT = process.env.GENEOAPP_LOCAL_AI_ENDPOINT ?? 'http://127.0.0.1:11434';
const DEFAULT_MODEL = process.env.GENEOAPP_LOCAL_AI_MODEL ?? '';
const MAX_CONTEXT_CHARS = 12_000;

// Intègre un serveur IA local (Ollama ou compatible OpenAI, comme LM Studio) —
// jamais d'appel hors de la machine ou du réseau local, jamais de réponse
// fictive : si l'IA est désactivée ou le serveur injoignable, l'erreur est
// honnête (503). L'IA ne propose que des suggestions, jamais de décision.
export class LocalAiService {
  constructor({
    database = null,
    enabled = process.env.GENEOAPP_LOCAL_AI === 'true',
    endpoint = DEFAULT_ENDPOINT,
    model = DEFAULT_MODEL,
    provider = 'OLLAMA',
    fetchImpl = fetch,
    sources = {},
  } = {}) {
    this.database = database;
    this.defaults = { enabled, endpoint, model, provider };
    this.fetchImpl = fetchImpl;
    // Accès en lecture aux données locales utilisées pour bâtir les prompts.
    this.sources = sources;
  }

  /** Réglages effectifs : base de données si disponible, sinon valeurs d'environnement. */
  getConfig() {
    const row = this.database?.prepare('SELECT * FROM local_ai_settings WHERE id = 1').get();
    if (!row) return { ...this.defaults };
    return {
      // L'ancienne variable d'environnement continue d'activer l'IA.
      enabled: row.enabled === 1 || this.defaults.enabled === true,
      provider: row.provider,
      endpoint: row.endpoint,
      model: row.model || this.defaults.model,
    };
  }

  get enabled() {
    return this.getConfig().enabled;
  }

  get endpoint() {
    return this.getConfig().endpoint;
  }

  get model() {
    return this.getConfig().model;
  }

  updateConfig(payload) {
    if (!this.database) throw new ServiceUnavailableError('Réglages indisponibles');
    if (payload === null || typeof payload !== 'object') {
      throw requiredError('body', 'Le corps de la requête doit être un objet JSON');
    }
    const current = this.database.prepare('SELECT * FROM local_ai_settings WHERE id = 1').get();
    const next = {
      enabled: payload.enabled === undefined ? current.enabled === 1 : payload.enabled === true,
      provider: payload.provider ?? current.provider,
      endpoint: payload.endpoint ?? current.endpoint,
      model: payload.model ?? current.model,
    };
    if (payload.enabled !== undefined && typeof payload.enabled !== 'boolean') {
      throw fieldError('enabled', 'INVALID', 'server.validation.invalid', 'enabled est invalide');
    }
    if (!PROVIDERS.includes(next.provider)) {
      throw fieldError(
        'provider',
        'NOT_ALLOWED',
        'server.validation.notAllowed',
        'provider invalide',
        {
          field: 'provider',
          allowed: PROVIDERS.join(', '),
        },
      );
    }
    if (typeof next.model !== 'string' || next.model.length > 200) {
      throw fieldError('model', 'INVALID', 'server.validation.invalid', 'model est invalide');
    }
    next.endpoint = assertLocalEndpoint(next.endpoint);
    this.database
      .prepare(
        'UPDATE local_ai_settings SET enabled = ?, provider = ?, endpoint = ?, model = ? WHERE id = 1',
      )
      .run(next.enabled ? 1 : 0, next.provider, next.endpoint, next.model.trim());
    return this.getConfig();
  }

  #provider(config) {
    return createProvider(config.provider, {
      endpoint: config.endpoint,
      fetchImpl: this.fetchImpl,
    });
  }

  /**
   * État de l'IA locale, sans jamais lever : désactivée, injoignable ou prête,
   * avec les modèles installés. N'appelle le réseau local que si l'IA est activée.
   */
  async status() {
    const config = this.getConfig();
    const base = {
      enabled: config.enabled,
      provider: config.provider,
      endpoint: config.endpoint,
      model: config.model,
      prompts: listPrompts(),
    };
    if (!config.enabled) return { ...base, state: 'DISABLED', models: [] };
    try {
      const models = await this.#provider(config).listModels();
      return { ...base, state: models.length > 0 ? 'READY' : 'NO_MODEL', models };
    } catch (error) {
      return { ...base, state: 'UNREACHABLE', models: [], reason: error.message };
    }
  }

  async #generate(config, request) {
    const provider = this.#provider(config);
    let model = config.model;
    if (!model) {
      // Pas de modèle choisi : le premier modèle installé, annoncé dans la réponse.
      [model] = await provider.listModels();
      if (!model)
        throw new ServiceUnavailableError('Aucun modèle n’est installé sur le serveur IA local');
    }
    const text = await provider.generate({ ...request, model });
    return { model, text };
  }

  async analyze(payload) {
    const config = this.getConfig();
    if (!config.enabled) throw new ServiceUnavailableError('L’IA locale est désactivée');

    const prompt = payload?.prompt;
    if (typeof prompt !== 'string' || prompt.trim() === '') {
      throw requiredError('prompt');
    }

    const { model, text } = await this.#generate(config, { prompt });
    return { model, response: text, generatedAt: new Date().toISOString() };
  }

  /** Texte local sur lequel le modèle travaille, selon la tâche. */
  #context(task, input) {
    const id = Number(input?.id);
    if (!Number.isInteger(id) || id <= 0) throw requiredError('id');
    const { notes, sources, research, assertions } = this.sources;
    if (task === 'analyze-note') {
      const note = notes.get(id);
      return {
        text: [note.title, note.body].filter(Boolean).join('\n'),
        subject: { type: 'NOTE', id },
      };
    }
    if (task === 'analyze-source') {
      const source = sources.get(id);
      const text = [
        `Titre : ${source.title}`,
        source.author ? `Auteur : ${source.author}` : null,
        source.publication_info ? `Publication : ${source.publication_info}` : null,
        source.source_kind ? `Nature : ${source.source_kind}` : null,
      ]
        .filter(Boolean)
        .join('\n');
      return { text, subject: { type: 'SOURCE', id } };
    }
    if (task === 'suggest-research') {
      const entry = research.get(id);
      const lines = [
        `Titre : ${entry.title}`,
        entry.objective ? `Objectif : ${entry.objective}` : null,
        entry.content ? `Note : ${entry.content}` : null,
        ...entry.hypotheses.map((item) => `Hypothèse (${item.status}) : ${item.title}`),
        ...entry.tasks.map((item) => `Tâche (${item.status}) : ${item.title}`),
      ].filter(Boolean);
      return { text: lines.join('\n'), subject: { type: 'RESEARCH', id } };
    }
    // explain-contradiction : la personne et le champ en conflit.
    const field = String(input?.field ?? '').toLowerCase();
    if (!field) throw requiredError('field');
    const group = assertions
      .conflicts({ entityType: 'PERSON', entityId: id })
      .find((item) => item.field === field);
    if (!group) throw new NotFoundError(`Aucune contradiction pour le champ « ${field} »`);
    const lines = group.assertions.map(
      (item) =>
        `Valeur « ${item.value} » (statut ${item.status}, preuve ${item.proof_level})` +
        (item.reasoning ? ` — ${item.reasoning}` : ''),
    );
    return {
      text: `Champ : ${field}\n${lines.join('\n')}`,
      subject: { type: 'PERSON', id, field },
    };
  }

  /**
   * Demande des suggestions au modèle local. Le résultat est TOUJOURS à relire
   * (`requiresHumanReview`) : rien n'est enregistré ni appliqué ici.
   */
  async suggest(payload) {
    const config = this.getConfig();
    if (!config.enabled) throw new ServiceUnavailableError('L’IA locale est désactivée');
    const task = payload?.task;
    const prompt = PROMPTS[task];
    if (!prompt) {
      throw fieldError('task', 'NOT_ALLOWED', 'server.validation.notAllowed', 'task invalide', {
        field: 'task',
        allowed: Object.keys(PROMPTS).join(', '),
      });
    }
    const context = this.#context(task, payload);
    if (!context.text || context.text.trim() === '') {
      throw fieldError(
        'id',
        'EMPTY',
        'server.validation.invalid',
        'Rien à analyser : le texte est vide',
      );
    }
    const text = context.text.slice(0, MAX_CONTEXT_CHARS);
    const { model, text: answer } = await this.#generate(config, {
      system: undefined,
      prompt: prompt.build({ text }),
      json: true,
    });
    const suggestions = parseSuggestions(answer, text);
    if (suggestions === null) {
      throw new ServiceUnavailableError(
        'La réponse du modèle local est inexploitable (JSON attendu) ; aucune suggestion n’a été créée',
      );
    }
    return {
      task,
      promptVersion: prompt.version,
      promptId: `${task}@${prompt.version}`,
      provider: config.provider,
      model,
      subject: context.subject,
      generatedAt: new Date().toISOString(),
      requiresHumanReview: true,
      suggestions,
    };
  }
}
