import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import './Toast.css';

const ToastContext = createContext({ show: () => 0, dismiss: () => {} });

const TONES = ['neutral', 'success', 'danger'];
const DEFAULT_DURATION_MS = 5000;

/**
 * Fournit `useToast().show(message, { tone, duration })`. Les messages sont
 * annoncés poliment (région `role="status"`, toujours montée pour que les
 * lecteurs d'écran annoncent bien les ajouts), disparaissent d'eux-mêmes et
 * restent fermables au clavier.
 */
export function ToastProvider({ children }) {
  const { t } = useI18n();
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (message, { tone = 'neutral', duration = DEFAULT_DURATION_MS } = {}) => {
      const id = nextId.current++;
      setToasts((current) => [...current.slice(-2), { id, message, tone }]);
      if (duration > 0) setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss],
  );

  const value = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="gds-toast-region" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`gds-toast gds-toast--${TONES.includes(toast.tone) ? toast.tone : 'neutral'}`}
          >
            <span className="gds-toast__message">{toast.message}</span>
            <button
              type="button"
              className="gds-toast__close"
              aria-label={t('toast.dismiss', 'Fermer la notification')}
              onClick={() => dismiss(toast.id)}
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
