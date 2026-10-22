import { useId, useRef } from 'react';
import { useTranslation } from '../../i18n/I18nProvider.jsx';
import { Button } from '../Button/Button.jsx';
import { Modal } from '../Modal/Modal.jsx';
import './ConfirmDialog.css';

/**
 * Confirmation shared pour les actions destructrices (suppression d’une
 * personne, dissolution d’une union, retrait d’un lien de parenté).
 *
 * Elle remplace la confirmation native `window.confirm` : même composant,
 * mêmes libellés traduits, focus piégé, annulation au clavier et announced
 * aux lecteurs d’écran via `role="alertdialog"`.
 */
export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel,
  confirmVariant = 'danger',
  isBusy = false,
  onConfirm,
  onCancel,
  children,
}) {
  const { t } = useTranslation();
  const confirmRef = useRef(null);
  const messageId = useId();

  return (
    <Modal
      isOpen={isOpen}
      role="alertdialog"
      title={title ?? t('confirmDialog.title', 'Confirmation')}
      describedById={messageId}
      onClose={onCancel}
      initialFocusRef={confirmRef}
    >
      <div className="gds-confirm">
        <p className="gds-confirm__message" id={messageId}>
          {message}
        </p>
        {children}
        <div className="gds-confirm__actions">
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={isBusy}
            ref={confirmRef}
          >
            {cancelLabel ?? t('confirmDialog.cancel', 'Annuler')}
          </Button>
          <Button
            type="button"
            variant={confirmVariant}
            onClick={onConfirm}
            loading={isBusy}
            disabled={isBusy}
          >
            {confirmLabel ?? t('confirmDialog.confirm', 'Confirmer')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
