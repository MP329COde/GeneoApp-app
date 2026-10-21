import { useEffect, useRef, useState } from 'react';
import { Badge, Button, useTranslation } from '../design-system/index.js';
import { client } from '../api/app-client.js';
import { ErrorNotice, personLabel } from '../components/shared.jsx';
import { AdvancedSearch } from './AdvancedSearch.jsx';
import { SiteSearch } from './SiteSearch.jsx';
import {
  MERGE_REASSIGNMENT_KEYS,
  PARENT_ROLE_KEYS as PARENT_ROLE_KEYS_EXPORT,
  SEARCH_ENTITY_KEYS,
  UNION_TYPE_KEYS as UNION_TYPE_KEYS_EXPORT,
} from './entity-labels.js';

export function CreatePersonForm({ onCreate, creating }) {
  const { t } = useTranslation();
  const [givenNames, setGivenNames] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [sex, setSex] = useState('');
  const firstNameRef = useRef(null);

  useEffect(() => {
    firstNameRef.current?.focus();
  }, []);

  const previewName =
    [givenNames.trim(), familyName.trim()].filter(Boolean).join(' ') || t('personForm.newPerson');

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!givenNames.trim() || !familyName.trim()) return;
    const created = await onCreate({
      givenNames: givenNames.trim(),
      familyName: familyName.trim(),
      ...(sex ? { sex } : {}),
    });
    if (created !== false) {
      setGivenNames('');
      setFamilyName('');
      setSex('');
    }
  };

  return (
    <form className="create-person-form" onSubmit={handleSubmit}>
      <div className="create-person-form__header">
        <span className="create-person-form__label">{t('personForm.preview')}</span>
        <strong>{previewName}</strong>
      </div>
      <label>
        <span>{t('personForm.givenNames')}</span>
        <input
          ref={firstNameRef}
          value={givenNames}
          onChange={(event) => setGivenNames(event.target.value)}
          placeholder={t('personForm.givenNamesExample')}
        />
      </label>
      <label>
        <span>{t('personForm.familyName')}</span>
        <input
          value={familyName}
          onChange={(event) => setFamilyName(event.target.value)}
          placeholder={t('personForm.familyNameExample')}
        />
      </label>
      <label>
        <span>{t('personForm.sex')}</span>
        <select value={sex} onChange={(event) => setSex(event.target.value)}>
          <option value="">{t('personForm.sexUnknown')}</option>
          <option value="F">{t('personForm.sexFemale')}</option>
          <option value="M">{t('personForm.sexMale')}</option>
        </select>
      </label>
      <p className="settings-hint">{t('personForm.hint')}</p>
      <Button type="submit" disabled={creating || !givenNames.trim() || !familyName.trim()}>
        {t('personForm.submit')}
      </Button>
    </form>
  );
}

export function SearchPanel({ onNavigate, selected, lifespan }) {
  const { t } = useTranslation();
  const [term, setTerm] = useState('');
  const [results, setResults] = useState(null);
  const [searchError, setSearchError] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!term.trim()) return;
    setSearchError(null);
    try {
      const found = await client.search.query(term.trim());
      setResults(found);
    } catch (queryError) {
      setSearchError(queryError.message);
      setResults(null);
    }
  };

  return (
    <div className="search-panel">
      <form onSubmit={handleSubmit} className="search-panel__form">
        <label className="search-box">
          <span>{t('searchPanel.label')}</span>
          <input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder={t('searchPanel.placeholder')}
          />
        </label>
        <Button type="submit" size="sm">
          {t('searchPanel.submit')}
        </Button>
      </form>
      {searchError ? <ErrorNotice message={searchError} /> : null}
      {results === null ? null : results.length === 0 ? (
        <p className="notice">{t('searchPanel.noResult', { term })}</p>
      ) : (
        <ul className="search-results">
          {results.map((result) => (
            <li key={`${result.entity_type}:${result.entity_id}`}>
              <Badge tone="neutral">
                {t(SEARCH_ENTITY_KEYS[result.entity_type] ?? '', result.entity_type)}
              </Badge>{' '}
              {result.title}
            </li>
          ))}
        </ul>
      )}
      <AdvancedSearch client={client} onNavigate={onNavigate} />
      <SiteSearch key={selected?.id ?? 'none'} person={selected} lifespan={lifespan} />
    </div>
  );
}

export function DuplicatesPanel({ onSelect, onMerged }) {
  const { t } = useTranslation();
  const [pairs, setPairs] = useState(null);
  const [duplicatesError, setDuplicatesError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pendingMerge, setPendingMerge] = useState(null);

  const handleScan = async () => {
    setBusy(true);
    setDuplicatesError(null);
    try {
      setPairs(await client.search.duplicates());
    } catch (scanError) {
      setDuplicatesError(scanError.message);
    } finally {
      setBusy(false);
    }
  };

  const handlePreviewMerge = async (survivorId, duplicateId) => {
    setBusy(true);
    setDuplicatesError(null);
    try {
      const preview = await client.search.previewMerge(survivorId, duplicateId);
      setPendingMerge({ survivorId, duplicateId, preview });
    } catch (previewError) {
      setDuplicatesError(previewError.message);
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmMerge = async () => {
    const { survivorId, duplicateId } = pendingMerge;
    setBusy(true);
    setDuplicatesError(null);
    try {
      await client.search.merge(survivorId, duplicateId);
      setPairs((current) => {
        if (!current) return current;
        const items = current.items.filter(
          (pair) => !pair.persons.some((person) => person.id === duplicateId),
        );
        return { items, total: Math.max(current.total - (current.items.length - items.length), 0) };
      });
      setPendingMerge(null);
      await onMerged?.();
    } catch (mergeError) {
      setDuplicatesError(mergeError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="search-panel">
      <div className="gedcom-panel__actions">
        <Button type="button" size="sm" onClick={handleScan} disabled={busy}>
          {t('duplicates.scan')}
        </Button>
      </div>
      {duplicatesError ? <ErrorNotice message={duplicatesError} /> : null}
      {pendingMerge ? (
        <div className="notice" role="alertdialog" aria-label={t('duplicates.confirmLabel')}>
          <p>
            {t('duplicates.confirmIntro', {
              duplicate: personLabel(pendingMerge.preview.duplicate),
              survivor: personLabel(pendingMerge.preview.survivor),
            })}
          </p>
          <ul>
            {Object.entries(pendingMerge.preview.reassignments)
              .filter(([, count]) => count > 0)
              .map(([key, count]) => (
                <li key={key}>{t(MERGE_REASSIGNMENT_KEYS[key] ?? '', { count, key })}</li>
              ))}
            {Object.values(pendingMerge.preview.reassignments).every((count) => count === 0) ? (
              <li>{t('duplicates.noReassignment')}</li>
            ) : null}
          </ul>
          <p>
            {t('duplicates.softDeleteHint', {
              duplicate: personLabel(pendingMerge.preview.duplicate),
            })}
          </p>
          <Button type="button" size="sm" onClick={handleConfirmMerge} disabled={busy}>
            {t('duplicates.confirm')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setPendingMerge(null)}
            disabled={busy}
          >
            {t('duplicates.cancel')}
          </Button>
        </div>
      ) : null}
      {pairs === null ? null : pairs.items.length === 0 ? (
        <p className="notice">{t('duplicates.none')}</p>
      ) : (
        <ul className="search-results">
          {pairs.total > pairs.items.length ? (
            <li className="notice">
              {t('duplicates.total', { count: pairs.total, shown: pairs.items.length })}
            </li>
          ) : null}
          {pairs.items.map((pair) => {
            const [left, right] = pair.persons;
            return (
              <li key={`${left.id}:${right.id}`}>
                <Badge tone="danger">{pair.score}%</Badge> {personLabel(left)} —{' '}
                {personLabel(right)}
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => onSelect(left.id)}
                >
                  {t('duplicates.viewA')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => onSelect(right.id)}
                >
                  {t('duplicates.viewB')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handlePreviewMerge(left.id, right.id)}
                  disabled={busy}
                >
                  {t('duplicates.mergeKeepA')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handlePreviewMerge(right.id, left.id)}
                  disabled={busy}
                >
                  {t('duplicates.mergeKeepB')}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Constantes réutilisées par les vues Familles (unions) et Parenté (rôles).
// Les libellés correspondants vivent dans les messages de traduction : voir
// `entity-labels.js` pour les clés.
export const UNION_TYPES = ['MARRIAGE', 'CIVIL_PARTNERSHIP', 'COHABITATION', 'OTHER'];

export const UNION_TYPE_KEYS = UNION_TYPE_KEYS_EXPORT;

export const PARENT_ROLES = ['FATHER', 'MOTHER', 'PARENT'];

export const PARENT_ROLE_KEYS = PARENT_ROLE_KEYS_EXPORT;

export { MERGE_REASSIGNMENT_KEYS };
