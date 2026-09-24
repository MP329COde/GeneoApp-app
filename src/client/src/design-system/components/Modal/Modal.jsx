import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '../../i18n/I18nProvider.jsx';
import './Modal.css';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Boîte de dialogue modale accessible :
 * - piège le focus à l'intérieur pendant qu'elle est ouverte (WCAG 2.4.3) ;
 * - restaure le focus sur l'élément déclencheur à la fermeture ;
 * - se ferme avec Échap et annonce son rôle/titre aux lecteurs d'écran.
 */
export function Modal({ isOpen, title, onClose, children }) {
  const titleId = useId();
  const dialogRef = useRef(null);
  const previouslyFocusedElement = useRef(null);
  const { t } = useTranslation();

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    previouslyFocusedElement.current = document.activeElement;
    const dialogNode = dialogRef.current;
    const focusableElements = dialogNode.querySelectorAll(FOCUSABLE_SELECTOR);
    (focusableElements[0] ?? dialogNode).focus();

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onClose();
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const focusable = Array.from(dialogNode.querySelectorAll(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocusedElement.current?.focus?.();
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return createPortal(
    <div className="gds-modal__overlay">
      <button
        type="button"
        className="gds-modal__overlay-dismiss"
        onClick={onClose}
        aria-label={t('modal.close')}
        tabIndex={-1}
      />
      <div
        ref={dialogRef}
        className="gds-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="gds-modal__header">
          <h2 id={titleId} className="gds-modal__title">
            {title}
          </h2>
          <button
            type="button"
            className="gds-modal__close"
            onClick={onClose}
            aria-label={t('modal.close')}
          >
            ×
          </button>
        </div>
        <div className="gds-modal__body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
