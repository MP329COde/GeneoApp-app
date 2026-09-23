import { useEffect, useState } from 'react';
import { EVENT_LABELS } from './PersonTimeline.jsx';

const CONFIDENCE_LABELS = { HIGH: 'élevée', MEDIUM: 'moyenne', LOW: 'faible' };

export function QualityMeter({ score, label = 'Qualité' }) {
  return (
    <span className="quality-meter" role="img" aria-label={`${label} : ${score} sur 4`}>
      {[1, 2, 3, 4].map((level) => (
        <span key={level} className={`quality-meter__bar${level <= score ? ' is-on' : ''}`} />
      ))}
    </span>
  );
}

// Qualité des données d'une personne (faits sourcés, confiance, contradictions).
export function QualityCard({ client, personId, version, onOpenCoherence, onOpenSources }) {
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
      <h3 id="quality-title">Qualité des données</h3>
      <div className="quality-card__ratio">
        <span>Faits sourcés</span>
        <strong className="data-id">
          {totals.sourced} / {totals.facts}
        </strong>
      </div>
      <div
        className="quality-card__progress"
        role="progressbar"
        aria-label="Faits sourcés"
        aria-valuemin={0}
        aria-valuemax={totals.facts}
        aria-valuenow={totals.sourced}
      >
        <span style={{ width: `${Math.round(ratio * 100)}%` }} />
      </div>
      <ul className="quality-card__list">
        {unsourced.length > 0 ? (
          <li>
            {unsourced.length} fait(s) sans source :{' '}
            {unsourced
              .map((fact) =>
                fact.kind === 'IDENTITY'
                  ? 'identité'
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
                  citer une source
                </button>
              </>
            ) : null}
          </li>
        ) : (
          <li>Tous les faits sont sourcés.</li>
        )}
        {totals.sourced > 0 ? (
          <li>
            Confiance :{' '}
            {Object.entries(confidence)
              .filter(([, count]) => count > 0)
              .map(([level, count]) => `${count} ${CONFIDENCE_LABELS[level]}`)
              .join(', ')}
          </li>
        ) : null}
        {issues.length > 0 ? (
          <li className="quality-card__issue">
            {issues.length} incohérence(s) (
            {issues.filter((issue) => issue.severity === 'CERTAIN').length} certaine(s))
            {onOpenCoherence ? (
              <>
                {' — '}
                <button
                  type="button"
                  className="link-button link-button--small"
                  onClick={onOpenCoherence}
                >
                  examiner
                </button>
              </>
            ) : null}
          </li>
        ) : null}
      </ul>
      <p className="quality-card__score">
        Indice de qualité <QualityMeter score={quality.score} />
      </p>
    </section>
  );
}
