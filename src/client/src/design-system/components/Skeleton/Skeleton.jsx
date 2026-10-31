import './Skeleton.css';

/**
 * Squelette de chargement : forme discrète (jeton `--skeleton`) avec un léger
 * balayage. Purement décoratif (aria-hidden) ; le libellé lu par les
 * lecteurs d'écran est porté par `SkeletonGroup`.
 */
export function Skeleton({ width = '100%', height = 14, shape = 'line' }) {
  return (
    <span
      className={`gds-skeleton gds-skeleton--${shape}`}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

/** Groupe de lignes de squelette annoncé comme « en cours de chargement ». */
export function SkeletonGroup({ label, rows = 3, avatar = false }) {
  return (
    <div className="gds-skeleton-group" role="status" aria-busy="true">
      <span className="gds-visually-hidden">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <div className="gds-skeleton-row" key={index}>
          {avatar ? <Skeleton shape="circle" width={36} height={36} /> : null}
          <div className="gds-skeleton-row__lines">
            <Skeleton width={index % 2 ? '58%' : '78%'} height={14} />
            <Skeleton width={index % 2 ? '38%' : '48%'} height={10} />
          </div>
        </div>
      ))}
    </div>
  );
}
