import { useEffect, useState } from 'react';
import { useTranslation } from '../design-system/index.js';
import { EVENT_LABELS } from './PersonTimeline.jsx';

// La confiance d'un fait est une valeur d'énumération renvoyée par le
// serveur : la table ci-dessous en donne la formulation dans chaque langue.
const CONFIDENCE_KEYS = {
  HIGH: 'quality.confidence.high',
  MEDIUM: 'quality.confidence.medium',
  LOW: 'quality.confidence.low',
};

export function QualityMeter({ score, label }) {
  const { t } = useTranslation();
  const meterLabel = label ?? t('quality.title');
  return (
    <span
      className="quality-meter"
      role="img"
      aria-label={t('quality.meterLabel', { label: meterLabel, score })}
    >
      {[1, 2, 3, 4].map((level) => (
        <span key={level} className={`quality-meter__bar${level <= score ? ' is-on' : ''}`} />
      ))}
    </span>
  );
}

// Qualité des données d'une personne (faits sourcés, confiance, contradictions).
export function QualityCard({ client, personId, version, onOpenCoherence, onOpenSources }) {
  const { t } = useTranslation();
  const [quality, setQuality] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setQuality(null);
    if (!client.quality) return undefined;
    Promise.resolve(client.quality(personId))
      .then((result) => !cancelled && setQuality(result ?? null))
      .catch((loadError) => !cancelled && setError(loadError.message));
    return () => {
      cancelled = true;
    };
  }, [client, personId, version]);

  if (!client.quality) return null;
  if (error) return <p className="notice notice--error">{error}</p>;
  if (!quality) return null;
  const { totals, issues, confidence, facts } = quality;
  const unsourced = facts.filter((fact) => !fact.sourced);
  const ratio = totals.facts ? totals.sourced / totals.facts : 0;

  return (
    <section className="detail-section quality-card" aria-labelledby="quality-title">
      <h3 id="quality-title">{t('quality.title')}</h3>
      <div className="quality-card__ratio">
        <span>{t('quality.sourcedFacts')}</span>
        <strong className="data-id">
          {totals.sourced} / {totals.facts}
        </strong>
      </div>
      <div
        className="quality-card__progress"
        role="progressbar"
        aria-label={t('quality.sourcedFacts')}
        aria-valuemin={0}
        aria-valuemax={totals.facts}
        aria-valuenow={totals.sourced}
      >
        <span style={{ width: `${Math.round(ratio * 100)}%` }} />
      </div>
      <ul className="quality-card__list">
        {unsourced.length > 0 ? (
          <li>
            {t('quality.unsourced', { count: unsourced.length })}{' '}
            {unsourced
              .map((fact) =>
                fact.kind === 'IDENTITY'
                  ? t('quality.identity')
                  : (EVENT_LABELS[fact.type] ?? fact.type).toLowerCase(),
              )
              .join(', ')}
            {onOpenSources ? (
              <>
                {' — '}
                <button
                  type="button"
                  className="link-button link-button--small"
                  onClick={onOpenSources}
                >
                  {t('quality.citeSource')}
                </button>
              </>
            ) : null}
          </li>
        ) : (
          <li>{t('quality.allSourced')}</li>
        )}
        {totals.sourced > 0 ? (
          <li>
            {t('quality.confidence.label')}{' '}
            {Object.entries(confidence)
              .filter(([, count]) => count > 0)
              .map(([level, count]) => `${count} ${t(CONFIDENCE_KEYS[level] ?? level)}`)
              .join(', ')}
          </li>
        ) : null}
        {issues.length > 0 ? (
          <li className="quality-card__issue">
            {t('quality.issues', { count: issues.length })}{' '}
            {t('quality.certainIssues', {
              count: issues.filter((issue) => issue.severity === 'CERTAIN').length,
            })}
            {onOpenCoherence ? (
              <>
                {' — '}
                <button
                  type="button"
                  className="link-button link-button--small"
                  onClick={onOpenCoherence}
                >
                  {t('quality.examine')}
                </button>
              </>
            ) : null}
          </li>
        ) : null}
      </ul>
      <p className="quality-card__score">
        {t('quality.score')} <QualityMeter score={quality.score} />
      </p>
    </section>
  );
}
