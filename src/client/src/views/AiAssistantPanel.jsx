import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, useTranslation } from '../design-system/index.js';
import { ErrorNotice, personLabel } from '../components/shared.jsx';
import { ASSERTION_FIELDS } from './AssertionsPanel.jsx';

const TASKS = ['analyze-note', 'analyze-source', 'explain-contradiction', 'suggest-research'];
const STATE_TONES = {
  READY: 'success',
  DISABLED: 'neutral',
  UNREACHABLE: 'danger',
  NO_MODEL: 'warning',
};
const ASSERTABLE = new Set(['PERSON', 'EVENT', 'UNION', 'PARENTAGE', 'PLACE']);

// Assistant d'IA locale : réglages et état du serveur local, puis suggestions à
// valider. Une suggestion n'est jamais appliquée seule : « Proposer » crée une
// affirmation au statut PROPOSÉE (que l'utilisateur retient ou écarte ensuite),
// « Ajouter » crée une hypothèse ou une tâche de recherche.
export function AiAssistantPanel({ client }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await client.ai.status());
    } catch (loadError) {
      setError(loadError.message);
    }
  }, [client]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  return (
    <section className="ai-assistant" aria-labelledby="ai-assistant-title">
      <h3 id="ai-assistant-title">{t('aiAssistant.heading', 'Assistant d’IA locale')}</h3>
      {error ? <ErrorNotice message={error} /> : null}
      {status ? (
        <>
          <AiSettings client={client} status={status} onChanged={setStatus} onError={setError} />
          {status.state === 'READY' ? <AiSuggestions client={client} onError={setError} /> : null}
        </>
      ) : (
        <p role="status">{t('aiAssistant.loading', 'Chargement…')}</p>
      )}
    </section>
  );
}

function AiSettings({ client, status, onChanged, onError }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    enabled: status.enabled,
    provider: status.provider,
    endpoint: status.endpoint,
    model: status.model ?? '',
  });
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setBusy(true);
    onError(null);
    try {
      onChanged(await client.ai.updateConfig(form));
    } catch (saveError) {
      onError(saveError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p>
        <Badge tone={STATE_TONES[status.state] ?? 'neutral'}>
          {t(`aiAssistant.state.${status.state}`, status.state)}
        </Badge>{' '}
        {status.state === 'UNREACHABLE' ? <span className="data-id">{status.reason}</span> : null}
      </p>
      <p className="notice">
        {t(
          'aiAssistant.privacy',
          'Désactivée par défaut. Seuls un serveur de cette machine ou de votre réseau local (Ollama, LM Studio) sont acceptés : vos notes ne quittent jamais votre réseau. Les suggestions sont toujours à vérifier.',
        )}
      </p>
      <form className="create-person-form" onSubmit={handleSubmit}>
        <label>
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(event) => setForm({ ...form, enabled: event.target.checked })}
          />{' '}
          <span>{t('aiAssistant.enable', 'Activer l’IA locale')}</span>
        </label>
        <label>
          <span>{t('aiAssistant.provider', 'Fournisseur')}</span>
          <select
            value={form.provider}
            onChange={(event) => {
              const provider = event.target.value;
              setForm({
                ...form,
                provider,
                endpoint:
                  provider === 'OLLAMA' ? 'http://127.0.0.1:11434' : 'http://127.0.0.1:1234',
              });
            }}
          >
            <option value="OLLAMA">{t('aiAssistant.ollama', 'Ollama')}</option>
            <option value="OPENAI_COMPATIBLE">
              {t('aiAssistant.openai', 'LM Studio (compatible OpenAI)')}
            </option>
          </select>
        </label>
        <label>
          <span>{t('aiAssistant.endpoint', 'Adresse du serveur local')}</span>
          <input
            value={form.endpoint}
            onChange={(event) => setForm({ ...form, endpoint: event.target.value })}
          />
        </label>
        <label>
          <span>{t('aiAssistant.model', 'Modèle')}</span>
          <select
            value={form.model}
            onChange={(event) => setForm({ ...form, model: event.target.value })}
          >
            <option value="">{t('aiAssistant.firstModel', 'Premier modèle installé')}</option>
            {status.models.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
            {form.model && !status.models.includes(form.model) ? (
              <option value={form.model}>{form.model}</option>
            ) : null}
          </select>
        </label>
        <Button type="submit" size="sm" disabled={busy}>
          {t('aiAssistant.save', 'Enregistrer les réglages')}
        </Button>
      </form>
    </>
  );
}

function AiSuggestions({ client, onError }) {
  const { t } = useTranslation();
  const [task, setTask] = useState('analyze-note');
  const [choices, setChoices] = useState([]);
  const [targetId, setTargetId] = useState('');
  const [field, setField] = useState('birth_date');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [done, setDone] = useState({});

  useEffect(() => {
    setTargetId('');
    setResult(null);
    const load = {
      'analyze-note': () => client.notes.listAll(),
      'analyze-source': () => client.sources.list(),
      'explain-contradiction': async () => {
        const list = await client.persons.list();
        return list?.items ?? list ?? [];
      },
      'suggest-research': () => client.research.list(),
    }[task];
    load()
      .then((list) => setChoices(list ?? []))
      .catch(() => setChoices([]));
  }, [client, task]);

  const labelOf = (item) => {
    if (task === 'explain-contradiction') return personLabel(item);
    return item.title ?? `#${item.id}`;
  };

  const handleAsk = async (event) => {
    event.preventDefault();
    if (!targetId) return;
    setBusy(true);
    onError(null);
    setResult(null);
    setDone({});
    try {
      const chosen = choices.find((item) => String(item.id) === targetId);
      const response = await client.ai.suggest({
        task,
        id: Number(targetId),
        ...(task === 'explain-contradiction' ? { field } : {}),
      });
      let entity = null;
      if (task === 'analyze-note' && ASSERTABLE.has(chosen?.entity_type)) {
        entity = { entityType: chosen.entity_type, entityId: chosen.entity_id };
      } else if (task === 'explain-contradiction') {
        entity = { entityType: 'PERSON', entityId: Number(targetId) };
      }
      setResult({
        ...response,
        entity,
        researchId: task === 'suggest-research' ? Number(targetId) : null,
      });
    } catch (askError) {
      onError(askError.message);
    } finally {
      setBusy(false);
    }
  };

  const apply = async (index, action) => {
    onError(null);
    try {
      await action();
      setDone((current) => ({ ...current, [index]: 'applied' }));
    } catch (applyError) {
      onError(applyError.message);
    }
  };

  const reasoning = (suggestion) =>
    `${t('aiAssistant.reasoningPrefix', 'Suggestion de l’IA locale')} (${result.promptId}, ${result.model}) — ${t('aiAssistant.toVerify', 'à vérifier')}` +
    (suggestion.quote ? ` · « ${suggestion.quote} »` : '');

  return (
    <>
      <h4>{t('aiAssistant.suggestHeading', 'Demander des suggestions')}</h4>
      <form className="create-person-form" onSubmit={handleAsk}>
        <label>
          <span>{t('aiAssistant.task', 'Analyse')}</span>
          <select value={task} onChange={(event) => setTask(event.target.value)}>
            {TASKS.map((id) => (
              <option key={id} value={id}>
                {t(`aiAssistant.task.${id}`, id)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t(`aiAssistant.target.${task}`, 'Élément')}</span>
          <select value={targetId} onChange={(event) => setTargetId(event.target.value)}>
            <option value="">{t('aiAssistant.choose', '— Choisir —')}</option>
            {choices.map((item) => (
              <option key={item.id} value={item.id}>
                {labelOf(item)}
              </option>
            ))}
          </select>
        </label>
        {task === 'explain-contradiction' ? (
          <label>
            <span>{t('aiAssistant.field', 'Champ en contradiction')}</span>
            <select value={field} onChange={(event) => setField(event.target.value)}>
              {ASSERTION_FIELDS.map((name) => (
                <option key={name} value={name}>
                  {t(`assertions.field.${name}`, name)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <Button type="submit" size="sm" disabled={busy || !targetId}>
          {busy ? t('aiAssistant.running', 'Analyse en cours…') : t('aiAssistant.ask', 'Analyser')}
        </Button>
      </form>

      {result ? (
        <section aria-live="polite" aria-label={t('aiAssistant.results', 'Suggestions')}>
          <p className="notice">
            {t(
              'aiAssistant.reviewNotice',
              { model: result.model, prompt: result.promptId },
              'Suggestions de {model} ({prompt}). Rien n’est appliqué : vérifiez chaque point avant de l’enregistrer.',
            )}
          </p>
          {result.suggestions.length === 0 ? (
            <p className="notice">{t('aiAssistant.none', 'Le modèle n’a rien à proposer.')}</p>
          ) : (
            <ul className="search-results">
              {result.suggestions.map((suggestion, index) => (
                <li key={`${suggestion.kind}-${index}`} data-testid={`suggestion-${index}`}>
                  <Badge tone="neutral">
                    {t(`aiAssistant.kind.${suggestion.kind}`, suggestion.kind)}
                  </Badge>{' '}
                  <strong>{suggestion.text}</strong>
                  {suggestion.field && suggestion.value ? (
                    <p className="data-id">
                      {t(`assertions.field.${suggestion.field}`, suggestion.field)} :{' '}
                      {suggestion.value}
                    </p>
                  ) : null}
                  {suggestion.rationale ? <p className="data-id">{suggestion.rationale}</p> : null}
                  {suggestion.quote ? (
                    <p className="data-id">
                      « {suggestion.quote} »{' '}
                      <Badge tone={suggestion.grounded ? 'success' : 'warning'}>
                        {suggestion.grounded
                          ? t('aiAssistant.grounded', 'Extrait retrouvé dans le texte')
                          : t(
                              'aiAssistant.ungrounded',
                              'Extrait introuvable : à ne pas croire sans vérification',
                            )}
                      </Badge>
                    </p>
                  ) : null}
                  {done[index] === 'dismissed' ? (
                    <p role="status">{t('aiAssistant.dismissed', 'Suggestion ignorée.')}</p>
                  ) : done[index] ? (
                    <p role="status">{t('aiAssistant.applied', 'Enregistré (à relire).')}</p>
                  ) : (
                    <div className="verification__actions">
                      {suggestion.kind === 'FACT' &&
                      suggestion.field &&
                      suggestion.value &&
                      result.entity ? (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() =>
                            apply(index, () =>
                              client.assertions.create({
                                ...result.entity,
                                field: suggestion.field,
                                value: suggestion.value,
                                reasoning: reasoning(suggestion),
                              }),
                            )
                          }
                        >
                          {t('aiAssistant.proposeFact', 'Proposer comme affirmation')}
                        </Button>
                      ) : null}
                      {suggestion.kind === 'HYPOTHESIS' && result.researchId ? (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() =>
                            apply(index, () =>
                              client.research.addHypothesis(result.researchId, {
                                title: suggestion.text.slice(0, 200),
                                content: suggestion.rationale || suggestion.text,
                              }),
                            )
                          }
                        >
                          {t('aiAssistant.addHypothesis', 'Ajouter comme hypothèse')}
                        </Button>
                      ) : null}
                      {suggestion.kind === 'TASK' && result.researchId ? (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() =>
                            apply(index, () =>
                              client.research.addTask(result.researchId, {
                                title: suggestion.text.slice(0, 200),
                                priority: 'MEDIUM',
                              }),
                            )
                          }
                        >
                          {t('aiAssistant.addTask', 'Ajouter comme tâche')}
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => setDone((current) => ({ ...current, [index]: 'dismissed' }))}
                      >
                        {t('aiAssistant.dismiss', 'Ignorer')}
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </>
  );
}
