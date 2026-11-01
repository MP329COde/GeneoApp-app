import { useEffect, useRef, useState } from 'react';
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  SkeletonGroup,
  useTranslation,
} from '../design-system/index.js';
import '../styles/admin-refonte.css';
import { client } from '../api/app-client.js';
import { ErrorNotice, Icon, personLabel } from '../components/shared.jsx';
import {
  MERGE_REASSIGNMENT_KEYS,
  PARENT_ROLE_KEYS as PARENT_ROLE_KEYS_EXPORT,
  UNION_TYPE_KEYS as UNION_TYPE_KEYS_EXPORT,
} from './entity-labels.js';
import { MergeIdentityNotes } from '../components/MergeIdentityNotes.jsx';

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

  const reassignments = pendingMerge
    ? Object.entries(pendingMerge.preview.reassignments).filter(([, count]) => count > 0)
    : [];

  return (
    <div className="adm">
      <header className="adm__head">
        <h3 className="adm__title">{t('admin.duplicates.title', 'Doublons possibles')}</h3>
        <p className="adm__intro">
          {t(
            'admin.duplicates.intro',
            'Repérez les fiches qui pourraient désigner la même personne. Rien n’est fusionné sans votre confirmation.',
          )}
        </p>
      </header>
      <div className="adm-actions">
        <Button type="button" onClick={handleScan} disabled={busy} loading={busy && pairs === null}>
          {t('duplicates.scan')}
        </Button>
      </div>
      {duplicatesError ? <ErrorNotice message={duplicatesError} /> : null}
      {pairs === null ? (
        busy ? (
          <SkeletonGroup label={t('admin.duplicates.scanning', 'Analyse en cours…')} rows={3} />
        ) : (
          <section className="adm-card">
            <EmptyState
              icon={<Icon name="search" />}
              title={t('admin.duplicates.idleTitle', 'Aucune analyse lancée')}
            >
              {t(
                'admin.duplicates.idleBody',
                'Lancez l’analyse : les paires les plus ressemblantes apparaîtront ici, avec leur score.',
              )}
            </EmptyState>
          </section>
        )
      ) : pairs.items.length === 0 ? (
        <section className="adm-card">
          <EmptyState
            icon={<Icon name="shield" />}
            title={t('admin.duplicates.noneTitle', 'Votre arbre est propre')}
          >
            {t('duplicates.none')}
          </EmptyState>
        </section>
      ) : (
        <>
          {pairs.total > pairs.items.length ? (
            <p className="adm-card__note">
              {t('duplicates.total', { count: pairs.total, shown: pairs.items.length })}
            </p>
          ) : null}
          <ul className="adm-list">
            {pairs.items.map((pair) => {
              const [left, right] = pair.persons;
              return (
                <li key={`${left.id}:${right.id}`} className="adm-pair">
                  <div className="adm-pair__people">
                    <p className="adm-pair__person">{personLabel(left)}</p>
                    <Badge tone="danger">{pair.score}%</Badge>
                    <p className="adm-pair__person">{personLabel(right)}</p>
                  </div>
                  <div className="adm-actions">
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
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <ConfirmDialog
        isOpen={pendingMerge !== null}
        title={t('duplicates.confirmLabel')}
        message={
          pendingMerge
            ? t('duplicates.confirmIntro', {
                duplicate: personLabel(pendingMerge.preview.duplicate),
                survivor: personLabel(pendingMerge.preview.survivor),
              })
            : ''
        }
        confirmLabel={t('duplicates.confirm')}
        cancelLabel={t('duplicates.cancel')}
        confirmVariant="primary"
        isBusy={busy}
        onConfirm={handleConfirmMerge}
        onCancel={() => setPendingMerge(null)}
      >
        {pendingMerge ? (
          <div className="adm-merge">
            <MergeIdentityNotes identity={pendingMerge.preview.identity} />
            <ul>
              {reassignments.map(([key, count]) => (
                <li key={key}>{t(MERGE_REASSIGNMENT_KEYS[key] ?? '', { count, key })}</li>
              ))}
              {reassignments.length === 0 ? <li>{t('duplicates.noReassignment')}</li> : null}
            </ul>
            <p>
              {t('duplicates.softDeleteHint', {
                duplicate: personLabel(pendingMerge.preview.duplicate),
              })}
            </p>
          </div>
        ) : null}
      </ConfirmDialog>
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
