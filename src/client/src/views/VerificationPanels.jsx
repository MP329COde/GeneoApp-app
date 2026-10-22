import { useEffect, useState } from 'react';
import { Badge, Button, useTranslation } from '../design-system/index.js';
import { client } from '../api/app-client.js';
import { ErrorNotice, personLabel } from '../components/shared.jsx';
import { useVerificationLabels } from '../hooks/useVerification.js';
import { MERGE_REASSIGNMENT_KEYS } from './PersonListPanels.jsx';

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
      className={`detail-section verification${issues.length ? ' verification--alert' : ''}`}
    >
      <h3>
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
      {pendingMerge ? (
        <div
          className="verification__confirm"
          role="alertdialog"
          aria-label={t('verification.confirmMergeAria', 'Confirmer la fusion')}
        >
          <p>
            {t('verification.mergeQuestion', {
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
          </ul>
          <div className="verification__actions">
            <Button type="button" size="sm" onClick={confirm} disabled={busy}>
              {t('verification.confirmMerge', 'Confirmer la fusion')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setPendingMerge(null)}
              disabled={busy}
            >
              {t('verification.cancel', 'Annuler')}
            </Button>
          </div>
        </div>
      ) : null}
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

  return (
    <div className="search-panel">
      <div className="gedcom-panel__actions">
        <Button type="button" size="sm" onClick={handleCheck} disabled={busy}>
          {t('verification.checkConsistency')}
        </Button>
      </div>
      {consistencyError ? <ErrorNotice message={consistencyError} /> : null}
      {cycles !== null || timelineIssues !== null ? (
        <>
          <h3>{t('verification.cyclesTitle')}</h3>
          {cycles.length === 0 ? (
            <p className="notice">{t('verification.noCycle')}</p>
          ) : (
            <ul className="search-results">
              {cycles.map((cycle, index) => (
                <li key={index}>
                  <Badge tone="danger">{t('verification.cycleBadge')}</Badge>{' '}
                  {cycle.map((id) => personLabelById(id)).join(' → ')}
                </li>
              ))}
            </ul>
          )}

          <h3>{t('verification.timelineTitle')}</h3>
          {timelineIssues.length === 0 ? (
            <p className="notice">{t('verification.noTimelineIssue')}</p>
          ) : (
            <ul className="search-results">
              {timelineIssues.map((issue, index) => (
                <li
                  key={index}
                  className={`coherence-issue coherence-issue--${issue.severity.toLowerCase()}`}
                >
                  <span className="coherence-issue__severity">{severityLabel(issue.severity)}</span>{' '}
                  <strong>{issueLabel(issue.code)}</strong> —{' '}
                  {personLabelById(issue.personId ?? issue.childId)}
                  {issue.parentId
                    ? ` (${t('verification.parentOf', { name: personLabelById(issue.parentId) })})`
                    : ''}
                  {issue.message ? (
                    <span className="coherence-issue__detail">{issue.message}</span>
                  ) : null}
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
        </>
      ) : null}
    </div>
  );
}
