import { useEffect, useState } from 'react';
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
import { useVerificationLabels } from '../hooks/useVerification.js';
import { MERGE_REASSIGNMENT_KEYS } from './PersonListPanels.jsx';
import { MergeIdentityNotes } from '../components/MergeIdentityNotes.jsx';

export function VerificationSection({
  selected,
  issues,
  onNavigate,
  onCompare,
  onMerged,
  anchorId,
}) {
  const { t } = useTranslation();
  const { issueLabel, severityLabel } = useVerificationLabels();
  const [pendingMerge, setPendingMerge] = useState(null);
  const [busy, setBusy] = useState(false);
  const [mergeError, setMergeError] = useState(null);

  useEffect(() => {
    setPendingMerge(null);
    setMergeError(null);
  }, [selected.id]);

  const preview = async (survivorId, duplicateId) => {
    setBusy(true);
    setMergeError(null);
    try {
      const result = await client.search.previewMerge(survivorId, duplicateId);
      setPendingMerge({ survivorId, duplicateId, preview: result });
    } catch (previewError) {
      setMergeError(previewError.message);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    setMergeError(null);
    try {
      await client.search.merge(pendingMerge.survivorId, pendingMerge.duplicateId);
      const survivorId = pendingMerge.survivorId;
      setPendingMerge(null);
      await onMerged?.(survivorId);
    } catch (error) {
      setMergeError(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      id={anchorId}
      className={`detail-section inspector-card verification${issues.length ? ' verification--alert' : ''}`}
    >
      <h3 className="inspector-card__title">
        <Icon name={issues.length ? 'warning' : 'shield'} />
        {t('verification.sectionTitle', 'À vérifier')}{' '}
        {issues.length ? (
          <Badge tone="danger">{issues.length}</Badge>
        ) : (
          <Badge tone="success">{t('verification.allClear', 'RAS')}</Badge>
        )}
      </h3>
      {issues.length === 0 ? (
        <p className="verification__empty">
          {t('verification.noIssue', 'Aucun doublon ni incohérence détecté pour cette personne.')}
        </p>
      ) : (
        <ul className="verification__list">
          {issues.map((issue) => (
            <li
              key={issue.key}
              className={`verification__item verification__item--${issue.kind === 'timeline' ? issue.severity?.toLowerCase() : issue.kind}`}
            >
              {issue.kind === 'duplicate' ? (
                <>
                  <p>
                    <strong>{t('verification.duplicatePossible', { score: issue.score })}</strong>{' '}
                    {t('verification.duplicateWith', 'avec')}{' '}
                    <button
                      type="button"
                      className="link-button link-button--small"
                      onClick={() => onNavigate(issue.other.id)}
                    >
                      {personLabel(issue.other)}
                    </button>
                  </p>
                  {issue.reasons?.length ? (
                    <ul className="verification__reasons">
                      {issue.reasons.map((reason) => (
                        <li key={reason.code}>
                          {t(
                            `verification.reason.${reason.code}`,
                            { points: `${reason.weight > 0 ? '+' : ''}${reason.weight}` },
                            `${reason.code} ({points})`,
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="verification__actions">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => onCompare(issue.other.id)}
                    >
                      {t('verification.compare', 'Comparer')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => preview(selected.id, issue.other.id)}
                    >
                      {t('verification.mergeHere', 'Fusionner ici')}
                    </Button>
                  </div>
                </>
              ) : issue.kind === 'cycle' ? (
                <p>
                  <strong>{t('verification.cycleTitleShort')}</strong>
                  <span className="verification__detail">{t('verification.cycleDetail')}</span>
                </p>
              ) : (
                <p>
                  <strong>{issueLabel(issue.code)}</strong>
                  <span className="verification__detail">
                    {severityLabel(issue.severity)}
                    {issue.message ? ` — ${issue.message}` : ''}
                  </span>
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {mergeError ? <ErrorNotice message={mergeError} /> : null}
      <ConfirmDialog
        isOpen={pendingMerge !== null}
        title={t('verification.confirmMergeAria', 'Confirmer la fusion')}
        message={
          pendingMerge
            ? t('verification.mergeQuestion', {
                duplicate: personLabel(pendingMerge.preview.duplicate),
                survivor: personLabel(pendingMerge.preview.survivor),
              })
            : ''
        }
        confirmLabel={t('verification.confirmMerge', 'Confirmer la fusion')}
        cancelLabel={t('verification.cancel', 'Annuler')}
        confirmVariant="primary"
        isBusy={busy}
        onConfirm={confirm}
        onCancel={() => setPendingMerge(null)}
      >
        {pendingMerge ? (
          <div className="adm-merge">
            <MergeIdentityNotes identity={pendingMerge.preview.identity} />
            <ul>
              {Object.entries(pendingMerge.preview.reassignments)
                .filter(([, count]) => count > 0)
                .map(([key, count]) => (
                  <li key={key}>{t(MERGE_REASSIGNMENT_KEYS[key] ?? '', { count, key })}</li>
                ))}
            </ul>
          </div>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}

// Signale les incohérences réellement détectées par le moteur de graphe
// (`GenealogyGraphService#detectCycles`/`#validateTimeline`) — jamais
// corrigées ni fusionnées automatiquement, seulement portées à la
// connaissance de l'utilisateur pour validation humaine.
export function ConsistencyPanel({ onNavigate, personLabelById }) {
  const { t } = useTranslation();
  const { issueLabel, severityLabel } = useVerificationLabels();
  const [cycles, setCycles] = useState(null);
  const [timelineIssues, setTimelineIssues] = useState(null);
  const [consistencyError, setConsistencyError] = useState(null);
  const [busy, setBusy] = useState(false);

  const handleCheck = async () => {
    setBusy(true);
    setConsistencyError(null);
    try {
      const [cyclesResult, timelineResult] = await Promise.all([
        client.graph.cycles(),
        client.graph.timeline(),
      ]);
      setCycles(cyclesResult);
      setTimelineIssues(timelineResult);
    } catch (checkError) {
      setConsistencyError(checkError.message);
    } finally {
      setBusy(false);
    }
  };

  const checked = cycles !== null && timelineIssues !== null;
  const certain = checked ? timelineIssues.filter((issue) => issue.severity === 'CERTAIN') : [];
  const possible = checked ? timelineIssues.filter((issue) => issue.severity !== 'CERTAIN') : [];
  const allClear = checked && cycles.length === 0 && timelineIssues.length === 0;

  return (
    <div className="adm">
      <header className="adm__head">
        <h3 className="adm__title">{t('admin.consistency.title', 'Cohérence de l’arbre')}</h3>
        <p className="adm__intro">
          {t(
            'admin.consistency.intro',
            'Détecte les boucles de filiation et les dates impossibles ou inhabituelles. Rien n’est corrigé automatiquement : vous validez chaque cas.',
          )}
        </p>
      </header>
      <div className="adm-actions">
        <Button type="button" onClick={handleCheck} disabled={busy} loading={busy}>
          {t('verification.checkConsistency')}
        </Button>
      </div>
      {consistencyError ? <ErrorNotice message={consistencyError} /> : null}
      {!checked && !busy ? (
        <section className="adm-card">
          <EmptyState
            icon={<Icon name="shield" />}
            title={t('admin.consistency.idleTitle', 'Aucune vérification lancée')}
          >
            {t(
              'admin.consistency.idleBody',
              'Lancez la vérification pour contrôler les liens de parenté et les dates de toutes les personnes.',
            )}
          </EmptyState>
        </section>
      ) : null}
      {!checked && busy ? (
        <SkeletonGroup label={t('admin.consistency.checking', 'Vérification en cours…')} rows={3} />
      ) : null}
      {allClear ? (
        <section className="adm-card adm-card--accent">
          <EmptyState
            icon={<Icon name="shield" />}
            title={t('admin.consistency.allClearTitle', 'Tout est cohérent')}
          >
            {t('admin.consistency.allClearBody', 'Aucune boucle ni incohérence de dates détectée.')}
          </EmptyState>
        </section>
      ) : null}
      {checked ? (
        <>
          <section className="adm-card" aria-labelledby="consistency-cycles">
            <h4 id="consistency-cycles" className="adm-card__title">
              {t('verification.cyclesTitle')}{' '}
              <Badge tone={cycles.length ? 'danger' : 'success'}>{cycles.length}</Badge>
            </h4>
            {cycles.length === 0 ? (
              <p className="adm-card__note">{t('verification.noCycle')}</p>
            ) : (
              <ul className="adm-list">
                {cycles.map((cycle, index) => (
                  <li key={index} className="adm-row adm-row--certain">
                    <span className="adm-row__main">
                      <span>
                        <Badge tone="danger">{t('verification.cycleBadge')}</Badge>
                      </span>
                      <span className="adm-row__title">
                        {cycle.map((id) => personLabelById(id)).join(' → ')}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {[
            ['CERTAIN', 'verification.certainTitle', certain],
            ['POSSIBLE', 'verification.unusualTitle', possible],
          ].map(([severity, titleKey, list]) => (
            <section
              key={severity}
              className="adm-card"
              aria-labelledby={`consistency-${severity}`}
            >
              <h4 id={`consistency-${severity}`} className="adm-card__title">
                {t(titleKey)}{' '}
                <Badge tone={severity === 'CERTAIN' ? 'danger' : 'warning'}>{list.length}</Badge>
              </h4>
              {list.length === 0 ? (
                <p className="adm-card__note">{t('verification.noTimelineIssue')}</p>
              ) : (
                <ul className="adm-list">
                  {list.map((issue, index) => (
                    <li
                      key={index}
                      className={`adm-row adm-row--${severity.toLowerCase()} coherence-issue coherence-issue--${issue.severity.toLowerCase()}`}
                    >
                      <span className="adm-row__main">
                        <span className="coherence-issue__severity">
                          {severityLabel(issue.severity)}
                        </span>
                        <strong className="adm-row__title">
                          {issueLabel(issue.code)} —{' '}
                          {personLabelById(issue.personId ?? issue.childId)}
                          {issue.parentId
                            ? ` (${t('verification.parentOf', { name: personLabelById(issue.parentId) })})`
                            : ''}
                        </strong>
                        {issue.message ? (
                          <span className="adm-row__meta coherence-issue__detail">
                            {issue.message}
                          </span>
                        ) : null}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => onNavigate(issue.personId ?? issue.childId)}
                      >
                        {t('verification.viewRecord')}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </>
      ) : null}
    </div>
  );
}
