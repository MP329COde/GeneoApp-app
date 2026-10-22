import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, useTranslation } from '../design-system/index.js';
import { AnnotationsPanel } from './AnnotationsPanel.jsx';

// Libellés du carnet : indexés par code, traduits via l'i18n. Le repli
// affiche le code brut quand la clé manque, pour ne jamais laisser un
// écran vide si le serveur introduit une nouvelle valeur.
export const RESEARCH_STATUS_KEYS = {
  TODO: 'notebook.status.todo',
  IN_PROGRESS: 'notebook.status.inProgress',
  DONE: 'notebook.status.done',
  ABANDONED: 'notebook.status.abandoned',
};
export const PRIORITY_KEYS = {
  HIGH: 'notebook.priority.high',
  MEDIUM: 'notebook.priority.medium',
  LOW: 'notebook.priority.low',
};
const HYPOTHESIS_KEYS = {
  OPEN: 'notebook.hypothesis.open',
  SUPPORTED: 'notebook.hypothesis.supported',
  REJECTED: 'notebook.hypothesis.rejected',
};
const STANCE_KEYS = {
  SUPPORTS: 'notebook.stance.supports',
  CONTRADICTS: 'notebook.stance.contradicts',
  NEUTRAL: 'notebook.stance.neutral',
};

function personName(person) {
  return `${person.given_names} ${person.family_name}`;
}

function formatDate(value) {
  if (!value) return null;
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function isOverdue(task) {
  if (!task.due_date || task.status === 'DONE' || task.status === 'ABANDONED') return false;
  return task.due_date < new Date().toISOString().slice(0, 10);
}

// Les options portent une clé de traduction ; le repli est le code brut,
// ce qui évite une liste vide si le serveur introduit une nouvelle valeur.
function SelectField({ label, value, onChange, options }) {
  const { t } = useTranslation();
  return (
    <label>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {Object.entries(options).map(([key, text]) => (
          <option key={key} value={key}>
            {t(text, key)}
          </option>
        ))}
      </select>
    </label>
  );
}

function ResearchDetail({ client, researchId, persons, onNavigate, onClose, onChanged }) {
  const { t } = useTranslation();
  const [research, setResearch] = useState(null);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);
  const [hypothesis, setHypothesis] = useState({ title: '', content: '' });
  const [task, setTask] = useState({ title: '', priority: 'MEDIUM', dueDate: '' });
  const [evidence, setEvidence] = useState({});

  const load = useCallback(async () => {
    try {
      const loaded = await client.research.get(researchId);
      setResearch(loaded);
      setDraft({
        status: loaded.status,
        priority: loaded.priority,
        dueDate: loaded.due_date ?? '',
        objective: loaded.objective ?? '',
        archives: loaded.archives ?? '',
        result: loaded.result ?? '',
      });
    } catch (loadError) {
      setError(loadError.message);
    }
  }, [client, researchId]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (action, message) => {
    setError(null);
    setStatus(null);
    try {
      await action();
      await load();
      onChanged();
      if (message) setStatus(message);
      return true;
    } catch (actionError) {
      setError(actionError.message);
      return false;
    }
  };

  if (!research || !draft) {
    return error ? (
      <p role="alert" className="notice notice--error">
        {error}
      </p>
    ) : (
      <p role="status" className="loading-line">
        {t('notebook.loading', 'Chargement de la recherche…')}
      </p>
    );
  }

  const person = persons.find((candidate) => candidate.id === research.person_id);

  return (
    <article className="research-detail" aria-labelledby="research-title">
      <header className="research-detail__header">
        <Button variant="secondary" size="sm" onClick={onClose}>
          {t('notebook.backToList', '← Toutes les recherches')}
        </Button>
        <p className="data-id">
          {t('notebook.researchNumber', 'Recherche')} #{research.id}
        </p>
        <h4 id="research-title">{research.title}</h4>
        {person ? (
          <p>
            {t('notebook.person', 'Personne')} :{' '}
            <button type="button" className="link-button" onClick={() => onNavigate(person.id)}>
              {personName(person)}
            </button>
          </p>
        ) : null}
        {research.content ? <p className="research-detail__note">{research.content}</p> : null}
      </header>

      {error ? (
        <p role="alert" className="notice notice--error">
          {error}
        </p>
      ) : null}
      {status ? (
        <p role="status" className="notice">
          {status}
        </p>
      ) : null}

      <form
        className="research-detail__form"
        onSubmit={(event) => {
          event.preventDefault();
          run(
            () =>
              client.research.update(research.id, {
                ...draft,
                dueDate: draft.dueDate || null,
              }),
            t('notebook.saved', 'Recherche enregistrée.'),
          );
        }}
      >
        <SelectField
          label={t('notebook.status', 'Statut')}
          value={draft.status}
          options={RESEARCH_STATUS_KEYS}
          onChange={(value) => setDraft({ ...draft, status: value })}
        />
        <SelectField
          label={t('notebook.priority', 'Priorité')}
          value={draft.priority}
          options={PRIORITY_KEYS}
          onChange={(value) => setDraft({ ...draft, priority: value })}
        />
        <label>
          <span>{t('notebook.dueDate', 'Échéance')}</span>
          <input
            type="date"
            value={draft.dueDate}
            onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })}
          />
        </label>
        <label className="research-detail__wide">
          <span>{t('notebook.objective', 'Objectif')}</span>
          <textarea
            value={draft.objective}
            onChange={(event) => setDraft({ ...draft, objective: event.target.value })}
          />
        </label>
        <label className="research-detail__wide">
          <span>{t('notebook.archives', 'Archives consultées')}</span>
          <textarea
            value={draft.archives}
            onChange={(event) => setDraft({ ...draft, archives: event.target.value })}
          />
        </label>
        <label className="research-detail__wide">
          <span>{t('notebook.result', 'Résultat')}</span>
          <textarea
            value={draft.result}
            onChange={(event) => setDraft({ ...draft, result: event.target.value })}
          />
        </label>
        <Button type="submit">{t('notebook.save', 'Enregistrer la recherche')}</Button>
      </form>

      <section aria-labelledby="hypotheses-title" className="research-section">
        <h4 id="hypotheses-title">
          {t('notebook.hypotheses', 'Hypothèses')} ({research.hypotheses.length})
        </h4>
        {research.hypotheses.length === 0 ? (
          <p className="settings-hint">
            {t(
              'notebook.noHypothesis',
              'Aucune hypothèse. Formulez-en une pour y rattacher des preuves.',
            )}
          </p>
        ) : (
          <ol className="hypotheses">
            {research.hypotheses.map((item, index) => (
              <li key={item.id} className={`hypothesis hypothesis--${item.status.toLowerCase()}`}>
                <div className="hypothesis__head">
                  <p className="hypothesis__title">
                    <span className="data-id">
                      {t('notebook.hypothesis', 'Hypothèse')}{' '}
                      {String.fromCharCode(65 + (index % 26))}
                    </span>{' '}
                    {item.title}
                  </p>
                  <label className="hypothesis__status">
                    <span className="gds-visually-hidden">
                      {t('notebook.hypothesisStatus', 'Statut de l’hypothèse')} {item.title}
                    </span>
                    <select
                      value={item.status}
                      onChange={(event) =>
                        run(() =>
                          client.research.updateHypothesis(item.id, { status: event.target.value }),
                        )
                      }
                    >
                      {Object.entries(HYPOTHESIS_KEYS).map(([key, text]) => (
                        <option key={key} value={key}>
                          {t(text, key)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {item.content ? <p>{item.content}</p> : null}
                {item.evidence.length > 0 ? (
                  <ul className="evidence-list">
                    {item.evidence.map((proof) => (
                      <li
                        key={proof.id}
                        className={`evidence evidence--${proof.stance.toLowerCase()}`}
                      >
                        <Badge tone={proof.stance === 'CONTRADICTS' ? 'danger' : 'neutral'}>
                          {t(STANCE_KEYS[proof.stance] ?? 'notebook.stance.neutral', proof.stance)}
                        </Badge>
                        <span>{proof.content}</span>
                        <button
                          type="button"
                          className="link-button link-button--small"
                          onClick={() => run(() => client.research.removeEvidence(proof.id))}
                        >
                          {t('notebook.remove', 'Retirer')}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <form
                  className="evidence-form"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const entry = evidence[item.id] ?? { stance: 'SUPPORTS', content: '' };
                    if (!entry.content.trim()) return;
                    const ok = await run(
                      () =>
                        client.research.addEvidence(item.id, {
                          stance: entry.stance,
                          content: entry.content.trim(),
                        }),
                      t('notebook.evidenceAdded', 'Preuve ajoutée.'),
                    );
                    if (ok)
                      setEvidence({ ...evidence, [item.id]: { stance: 'SUPPORTS', content: '' } });
                  }}
                >
                  <label>
                    <span>
                      {t(
                        'notebook.evidenceFor',
                        { title: item.title },
                        `Preuve pour « ${item.title} »`,
                      )}
                    </span>
                    <input
                      value={evidence[item.id]?.content ?? ''}
                      onChange={(event) =>
                        setEvidence({
                          ...evidence,
                          [item.id]: {
                            stance: evidence[item.id]?.stance ?? 'SUPPORTS',
                            content: event.target.value,
                          },
                        })
                      }
                    />
                  </label>
                  <SelectField
                    label={t('notebook.stance', 'Sens')}
                    value={evidence[item.id]?.stance ?? 'SUPPORTS'}
                    options={STANCE_KEYS}
                    onChange={(value) =>
                      setEvidence({
                        ...evidence,
                        [item.id]: { content: evidence[item.id]?.content ?? '', stance: value },
                      })
                    }
                  />
                  <Button type="submit" size="sm" variant="secondary">
                    {t('notebook.addEvidence', 'Ajouter la preuve')}
                  </Button>
                </form>
              </li>
            ))}
          </ol>
        )}
        <form
          className="inline-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!hypothesis.title.trim()) return;
            const ok = await run(
              () =>
                client.research.addHypothesis(research.id, {
                  title: hypothesis.title.trim(),
                  content: hypothesis.content.trim(),
                }),
              t('notebook.hypothesisAdded', 'Hypothèse ajoutée.'),
            );
            if (ok) setHypothesis({ title: '', content: '' });
          }}
        >
          <label>
            <span>{t('notebook.newHypothesis', 'Nouvelle hypothèse')}</span>
            <input
              value={hypothesis.title}
              placeholder={t('notebook.hypothesisPlaceholder', 'Jean serait né à Nantes')}
              onChange={(event) => setHypothesis({ ...hypothesis, title: event.target.value })}
            />
          </label>
          <label>
            <span>{t('notebook.hypothesisArgument', 'Argumentation (facultatif)')}</span>
            <input
              value={hypothesis.content}
              onChange={(event) => setHypothesis({ ...hypothesis, content: event.target.value })}
            />
          </label>
          <Button type="submit" size="sm">
            {t('notebook.addHypothesis', 'Ajouter l’hypothèse')}
          </Button>
        </form>
      </section>

      <section aria-labelledby="tasks-title" className="research-section">
        <h4 id="tasks-title">
          {t('notebook.tasks', 'Tâches')} (
          {research.tasks.filter((item) => item.status === 'DONE').length}/{research.tasks.length})
        </h4>
        {research.tasks.length === 0 ? (
          <p className="settings-hint">{t('notebook.noTask', 'Aucune tâche.')}</p>
        ) : (
          <ul className="task-list">
            {research.tasks.map((item) => (
              <li key={item.id} className={`task${item.status === 'DONE' ? ' task--done' : ''}`}>
                <label className="task__check">
                  <input
                    type="checkbox"
                    checked={item.status === 'DONE'}
                    onChange={(event) =>
                      run(() =>
                        client.research.updateTask(item.id, {
                          status: event.target.checked ? 'DONE' : 'TODO',
                        }),
                      )
                    }
                  />
                  <span>{item.title}</span>
                </label>
                <Badge tone={item.priority === 'HIGH' ? 'danger' : 'neutral'}>
                  {t(PRIORITY_KEYS[item.priority] ?? 'notebook.priority.medium', item.priority)}
                </Badge>
                {item.due_date ? (
                  <span className={`data-id${isOverdue(item) ? ' task__overdue' : ''}`}>
                    {isOverdue(item) ? `${t('notebook.overdue', 'En retard')} · ` : ''}
                    {formatDate(item.due_date)}
                  </span>
                ) : null}
                <button
                  type="button"
                  className="link-button link-button--small"
                  aria-label={t(
                    'notebook.deleteTask',
                    { title: item.title },
                    `Supprimer la tâche ${item.title}`,
                  )}
                  onClick={() => run(() => client.research.removeTask(item.id))}
                >
                  {t('notebook.delete', 'Supprimer')}
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="inline-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!task.title.trim()) return;
            const ok = await run(
              () =>
                client.research.addTask(research.id, {
                  title: task.title.trim(),
                  priority: task.priority,
                  dueDate: task.dueDate || null,
                }),
              t('notebook.taskAdded', 'Tâche ajoutée.'),
            );
            if (ok) setTask({ title: '', priority: 'MEDIUM', dueDate: '' });
          }}
        >
          <label>
            <span>{t('notebook.newTask', 'Nouvelle tâche')}</span>
            <input
              value={task.title}
              placeholder={t('notebook.taskPlaceholder', 'Consulter les registres de Vendée')}
              onChange={(event) => setTask({ ...task, title: event.target.value })}
            />
          </label>
          <SelectField
            label={t('notebook.taskPriority', 'Priorité de la tâche')}
            value={task.priority}
            options={PRIORITY_KEYS}
            onChange={(value) => setTask({ ...task, priority: value })}
          />
          <label>
            <span>{t('notebook.taskDueDate', 'Échéance de la tâche')}</span>
            <input
              type="date"
              value={task.dueDate}
              onChange={(event) => setTask({ ...task, dueDate: event.target.value })}
            />
          </label>
          <Button type="submit" size="sm">
            {t('notebook.addTask', 'Ajouter la tâche')}
          </Button>
        </form>
      </section>

      {client.notes ? (
        <AnnotationsPanel
          client={client}
          entityType="SEARCH"
          entityId={research.id}
          heading={t('notebook.notes', 'Notes de recherche')}
          emptyLabel={t('notebook.noNote', 'Aucune note pour cette recherche.')}
        />
      ) : null}

      <Button
        variant="secondary"
        onClick={async () => {
          const ok = await run(() => client.research.remove(research.id));
          if (ok) onClose();
        }}
      >
        {t('notebook.trash', 'Mettre la recherche à la corbeille')}
      </Button>
    </article>
  );
}

// Carnet de recherche : pistes, objectifs, hypothèses étayées par des preuves,
// tâches avec priorité et échéance. Toutes les données viennent de l'API locale.
export function NotebookPanel({ client, persons, onNavigate }) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [filter, setFilter] = useState('ALL');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [objective, setObjective] = useState('');
  const [status, setStatus] = useState('TODO');
  const [priority, setPriority] = useState('MEDIUM');
  const [personId, setPersonId] = useState('');
  const [notebookError, setNotebookError] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadEntries = useCallback(async () => {
    try {
      setEntries(await client.research.list());
    } catch (loadError) {
      setNotebookError(loadError.message);
    }
  }, [client]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setBusy(true);
    setNotebookError(null);
    try {
      await client.research.create({
        title: title.trim(),
        content: content.trim(),
        status,
        priority,
        personId: personId ? Number(personId) : null,
        ...(objective.trim() ? { objective: objective.trim() } : {}),
      });
      setTitle('');
      setContent('');
      setObjective('');
      setPersonId('');
      await loadEntries();
    } catch (createError) {
      setNotebookError(createError.message);
    } finally {
      setBusy(false);
    }
  };

  if (openId !== null) {
    return (
      <div className="search-panel notebook">
        <ResearchDetail
          client={client}
          researchId={openId}
          persons={persons}
          onNavigate={onNavigate}
          onClose={() => {
            setOpenId(null);
            loadEntries();
          }}
          onChanged={loadEntries}
        />
      </div>
    );
  }

  const visible = (entries ?? []).filter((entry) => filter === 'ALL' || entry.status === filter);
  const personById = (id) => persons.find((candidate) => candidate.id === id);

  return (
    <div className="search-panel notebook">
      <h3>{t('notebook.title', 'Carnet de recherche')}</h3>
      {notebookError ? (
        <p role="alert" className="notice notice--error">
          {notebookError}
        </p>
      ) : null}

      <form onSubmit={handleSubmit}>
        <label>
          <span>{t('notebook.fieldTitle', 'Titre')}</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label>
          <span>{t('notebook.fieldNote', 'Note')}</span>
          <input value={content} onChange={(event) => setContent(event.target.value)} />
        </label>
        <label>
          <span>{t('notebook.fieldObjective', 'Objectif (facultatif)')}</span>
          <input
            value={objective}
            placeholder={t('notebook.objectivePlaceholder', 'Trouver son acte de mariage')}
            onChange={(event) => setObjective(event.target.value)}
          />
        </label>
        <SelectField
          label={t('notebook.status', 'Statut')}
          value={status}
          options={RESEARCH_STATUS_KEYS}
          onChange={setStatus}
        />
        <SelectField
          label={t('notebook.priority', 'Priorité')}
          value={priority}
          options={PRIORITY_KEYS}
          onChange={setPriority}
        />
        <label>
          <span>{t('notebook.linkedPerson', 'Personne liée (optionnel)')}</span>
          <select value={personId} onChange={(event) => setPersonId(event.target.value)}>
            <option value="">{t('notebook.noPerson', '— Aucune —')}</option>
            {persons.map((person) => (
              <option key={person.id} value={person.id}>
                {personName(person)}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" size="sm" disabled={busy}>
          {t('notebook.addEntry', 'Ajouter une piste de recherche')}
        </Button>
      </form>

      <div
        className="segmented notebook__filter"
        role="group"
        aria-label={t('notebook.filterByStatus', 'Filtrer par statut')}
      >
        {[['ALL', 'notebook.filterAll'], ...Object.entries(RESEARCH_STATUS_KEYS)].map(
          ([key, text]) => (
            <button
              key={key}
              type="button"
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
            >
              {t(text, key)}
            </button>
          ),
        )}
      </div>

      {entries === null ? (
        <p role="status">{t('notebook.loadingShort', 'Chargement…')}</p>
      ) : entries.length === 0 ? (
        <p className="notice">
          {t('notebook.noEntry', 'Aucune piste de recherche pour l’instant.')}
        </p>
      ) : visible.length === 0 ? (
        <p className="notice">
          {t('notebook.noEntryWithStatus', 'Aucune recherche avec ce statut.')}
        </p>
      ) : (
        <ul className="research-cards">
          {visible.map((entry) => {
            const person = entry.person_id ? personById(entry.person_id) : null;
            return (
              <li key={entry.id} className="research-card">
                <div className="research-card__badges">
                  <Badge tone={entry.status === 'DONE' ? 'success' : 'neutral'}>
                    {t(RESEARCH_STATUS_KEYS[entry.status] ?? 'notebook.status.todo', entry.status)}
                  </Badge>
                  <Badge tone={entry.priority === 'HIGH' ? 'danger' : 'neutral'}>
                    {t(PRIORITY_KEYS[entry.priority] ?? 'notebook.priority.medium', entry.priority)}
                  </Badge>
                  <span className="data-id">#{entry.id}</span>
                </div>
                <button
                  type="button"
                  className="research-card__title"
                  onClick={() => setOpenId(entry.id)}
                >
                  {entry.title}
                </button>
                <p className="research-card__content">{entry.content}</p>
                <p className="data-id">
                  {t('notebook.hypothesisCount', { count: entry.hypothesis_count ?? 0 })} ·{' '}
                  {t('notebook.taskProgress', {
                    count: entry.task_count ?? 0,
                    done: entry.done_task_count ?? 0,
                  })}
                  {entry.due_date
                    ? ` · ${t('notebook.dueDateShort', 'échéance')} ${formatDate(entry.due_date)}`
                    : ''}
                </p>
                {entry.person_id ? (
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => onNavigate(entry.person_id)}
                  >
                    {person
                      ? personName(person)
                      : t(
                          'notebook.personNumber',
                          { id: entry.person_id },
                          `Personne #${entry.person_id}`,
                        )}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
