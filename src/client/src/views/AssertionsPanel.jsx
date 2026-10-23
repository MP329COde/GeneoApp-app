import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, useTranslation } from '../design-system/index.js';
import { ErrorNotice } from '../components/shared.jsx';

// Champs courants proposés ; un champ libre (minuscules, chiffres, _ et .) reste possible.
export const ASSERTION_FIELDS = [
  'birth_date',
  'birth_place',
  'death_date',
  'death_place',
  'marriage_date',
  'occupation',
  'residence',
  'given_names',
  'family_name',
  'sex',
];
const PROOF_LEVELS = ['UNSUPPORTED', 'POSSIBLE', 'PROBABLE', 'PROVEN'];
const STATUS_TONES = { ACCEPTED: 'success', PROPOSED: 'neutral', REJECTED: 'danger' };

// Affirmations d'une fiche : chaque valeur avec ses sources, son niveau de preuve
// et son statut. Plusieurs valeurs différentes pour un même champ forment une
// contradiction signalée ; retenir ou écarter une valeur est toujours une action
// explicite de l'utilisateur, jamais automatique.
export function AssertionsPanel({ client, entityType, entityId, heading }) {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [conflicts, setConflicts] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ field: 'birth_date', custom: '', value: '', reasoning: '' });

  const load = useCallback(async () => {
    try {
      const [list, groups] = await Promise.all([
        client.assertions.list({ entityType, entityId }),
        client.assertions.conflicts({ entityType, entityId }),
      ]);
      setItems(list ?? []);
      setConflicts(groups ?? []);
    } catch (loadError) {
      setError(loadError.message);
    }
  }, [client, entityType, entityId]);

  useEffect(() => {
    setItems(null);
    load();
  }, [load]);

  const run = async (action) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
      return true;
    } catch (actionError) {
      setError(actionError.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const fieldLabel = (field) => t(`assertions.field.${field}`, field);
  const conflictFields = new Set(conflicts.map((group) => group.field));

  const handleCreate = async (event) => {
    event.preventDefault();
    const field = form.field === '__custom' ? form.custom.trim() : form.field;
    if (!field || !form.value.trim()) return;
    const ok = await run(() =>
      client.assertions.create({
        entityType,
        entityId,
        field,
        value: form.value.trim(),
        ...(form.reasoning.trim() ? { reasoning: form.reasoning.trim() } : {}),
      }),
    );
    if (ok) setForm({ ...form, value: '', reasoning: '' });
  };

  const byField = new Map();
  for (const item of items ?? []) {
    if (!byField.has(item.field)) byField.set(item.field, []);
    byField.get(item.field).push(item);
  }

  return (
    <section className="assertions-panel" aria-labelledby={`assertions-${entityType}-${entityId}`}>
      <h3 id={`assertions-${entityType}-${entityId}`}>
        {heading ?? t('assertions.heading', 'Affirmations et preuves')}
      </h3>
      {error ? <ErrorNotice message={error} /> : null}

      <form className="create-person-form" onSubmit={handleCreate}>
        <label>
          <span>{t('assertions.field', 'Champ')}</span>
          <select
            value={form.field}
            onChange={(event) => setForm({ ...form, field: event.target.value })}
          >
            {ASSERTION_FIELDS.map((field) => (
              <option key={field} value={field}>
                {fieldLabel(field)}
              </option>
            ))}
            <option value="__custom">{t('assertions.customField', 'Autre champ…')}</option>
          </select>
        </label>
        {form.field === '__custom' ? (
          <label>
            <span>{t('assertions.customName', 'Nom du champ (ex. religion)')}</span>
            <input
              value={form.custom}
              onChange={(event) => setForm({ ...form, custom: event.target.value })}
            />
          </label>
        ) : null}
        <label>
          <span>{t('assertions.value', 'Valeur affirmée')}</span>
          <input
            value={form.value}
            onChange={(event) => setForm({ ...form, value: event.target.value })}
          />
        </label>
        <label>
          <span>{t('assertions.reasoning', 'Raisonnement (facultatif)')}</span>
          <input
            value={form.reasoning}
            onChange={(event) => setForm({ ...form, reasoning: event.target.value })}
          />
        </label>
        <Button type="submit" size="sm" disabled={busy || !form.value.trim()}>
          {t('assertions.add', 'Ajouter l’affirmation')}
        </Button>
      </form>

      {items === null ? (
        <p role="status">{t('assertions.loading', 'Chargement…')}</p>
      ) : items.length === 0 ? (
        <p className="notice">
          {t('assertions.empty', 'Aucune affirmation enregistrée pour cette fiche.')}
        </p>
      ) : (
        [...byField.entries()].map(([field, list]) => (
          <div key={field} className="assertions-panel__group">
            <h4>
              {fieldLabel(field)}{' '}
              {conflictFields.has(field) ? (
                <Badge tone="warning">{t('assertions.conflict', 'Contradiction à trancher')}</Badge>
              ) : null}
            </h4>
            <ul className="search-results">
              {list.map((item) => (
                <AssertionItem
                  key={item.id}
                  item={item}
                  busy={busy}
                  client={client}
                  entityType={entityType}
                  run={run}
                />
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}

function AssertionItem({ item, busy, client, run }) {
  const { t } = useTranslation();
  const [citing, setCiting] = useState(false);
  const [sources, setSources] = useState([]);
  const [citation, setCitation] = useState({
    sourceId: '',
    page: '',
    evidenceType: 'DIRECT',
    informationQuality: 'PRIMARY',
  });
  const support = item.support ?? {};

  useEffect(() => {
    if (!citing) return;
    client.sources
      .list()
      .then((list) => setSources(list ?? []))
      .catch(() => setSources([]));
  }, [citing, client]);

  const decide = (action) => run(() => client.assertions[action](item.id));

  return (
    <li data-testid={`assertion-${item.id}`}>
      <strong>{item.value}</strong>{' '}
      <Badge tone={STATUS_TONES[item.status] ?? 'neutral'}>
        {t(`assertions.status.${item.status}`, item.status)}
      </Badge>
      {item.reasoning ? <p className="data-id">{item.reasoning}</p> : null}
      <p className="data-id">
        {t(
          'assertions.support',
          { count: support.citations ?? 0, sources: support.independentSources ?? 0 },
          '{count} citation(s), {sources} source(s) distincte(s)',
        )}
        {support.suggestedProofLevel
          ? ` · ${t('assertions.suggested', 'niveau suggéré')} : ${t(`assertions.proof.${support.suggestedProofLevel}`, support.suggestedProofLevel)}`
          : ''}
      </p>
      <label>
        <span>{t('assertions.proofLevel', 'Niveau de preuve')}</span>
        <select
          value={item.proof_level}
          disabled={busy}
          onChange={(event) =>
            run(() => client.assertions.update(item.id, { proofLevel: event.target.value }))
          }
        >
          {PROOF_LEVELS.map((level) => (
            <option key={level} value={level}>
              {t(`assertions.proof.${level}`, level)}
            </option>
          ))}
        </select>
      </label>
      <div className="verification__actions">
        {item.status !== 'ACCEPTED' ? (
          <Button type="button" size="sm" disabled={busy} onClick={() => decide('accept')}>
            {t('assertions.accept', 'Retenir')}
          </Button>
        ) : null}
        {item.status !== 'REJECTED' ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => decide('reject')}
          >
            {t('assertions.reject', 'Écarter')}
          </Button>
        ) : null}
        {item.status !== 'PROPOSED' ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => decide('reopen')}
          >
            {t('assertions.reopen', 'Remettre en discussion')}
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => setCiting((value) => !value)}
          aria-expanded={citing}
        >
          {t('assertions.cite', 'Citer une source')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="danger"
          disabled={busy}
          onClick={() => decide('remove')}
        >
          {t('assertions.remove', 'Supprimer')}
        </Button>
      </div>
      {citing ? (
        <form
          className="create-person-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!citation.sourceId) return;
            const ok = await run(() =>
              client.sources.addCitation({
                sourceId: Number(citation.sourceId),
                entityType: 'ASSERTION',
                entityId: item.id,
                evidenceType: citation.evidenceType,
                informationQuality: citation.informationQuality,
                ...(citation.page.trim() ? { page: citation.page.trim() } : {}),
              }),
            );
            if (ok) setCiting(false);
          }}
        >
          <label>
            <span>{t('assertions.source', 'Source')}</span>
            <select
              value={citation.sourceId}
              onChange={(event) => setCitation({ ...citation, sourceId: event.target.value })}
            >
              <option value="">{t('assertions.chooseSource', '— Choisir une source —')}</option>
              {sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t('assertions.page', 'Page ou référence')}</span>
            <input
              value={citation.page}
              onChange={(event) => setCitation({ ...citation, page: event.target.value })}
            />
          </label>
          <label>
            <span>{t('assertions.evidenceType', 'Nature de la preuve')}</span>
            <select
              value={citation.evidenceType}
              onChange={(event) => setCitation({ ...citation, evidenceType: event.target.value })}
            >
              {['DIRECT', 'INDIRECT', 'NEGATIVE', 'UNKNOWN'].map((value) => (
                <option key={value} value={value}>
                  {t(`assertions.evidence.${value}`, value)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t('assertions.informationQuality', 'Qualité de l’information')}</span>
            <select
              value={citation.informationQuality}
              onChange={(event) =>
                setCitation({ ...citation, informationQuality: event.target.value })
              }
            >
              {['PRIMARY', 'SECONDARY', 'UNKNOWN'].map((value) => (
                <option key={value} value={value}>
                  {t(`assertions.quality.${value}`, value)}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" size="sm" disabled={busy || !citation.sourceId}>
            {t('assertions.addCitation', 'Ajouter la citation')}
          </Button>
        </form>
      ) : null}
    </li>
  );
}
