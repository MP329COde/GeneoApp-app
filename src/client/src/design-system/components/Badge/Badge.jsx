import './Badge.css';

const TONES = ['neutral', 'success', 'danger'];

/**
 * Badge de statut. Ne repose jamais sur la couleur seule : le texte porte
 * toujours l'information (WCAG 1.4.1).
 */
export function Badge({ tone = 'neutral', children }) {
  return <span className={`gds-badge gds-badge--${tone}`}>{children}</span>;
}

export { TONES as BADGE_TONES };
