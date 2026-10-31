import { useEffect } from 'react';
import { useTranslation } from '../design-system/index.js';

/**
 * Retour d'action : message visible (disparaît seul) ET annoncé aux lecteurs
 * d'écran via une région `status`. `feedback` = { id, text } ou null.
 */
export function ActionToast({ feedback, onDismiss }) {
  const { t } = useTranslation();
  useEffect(() => {
    if (!feedback) return undefined;
    const timer = setTimeout(onDismiss, 6000);
    return () => clearTimeout(timer);
  }, [feedback, onDismiss]);

  return (
    <div className="action-toast-region" role="status" aria-live="polite">
      {feedback ? (
        <p className="action-toast" key={feedback.id}>
          <span className="action-toast__mark" aria-hidden="true">
            ✓
          </span>
          <span className="action-toast__text">{feedback.text}</span>
          <button
            type="button"
            className="action-toast__close"
            aria-label={t('family.toast.dismiss', 'Fermer le message')}
            onClick={onDismiss}
          >
            <span aria-hidden="true">×</span>
          </button>
        </p>
      ) : null}
    </div>
  );
}
