import { forwardRef } from 'react';
import { useTranslation } from '../../i18n/I18nProvider.jsx';
import './Button.css';

const VARIANTS = ['primary', 'secondary', 'danger'];
const SIZES = ['sm', 'md', 'lg'];

/**
 * Bouton générique accessible : gère l'état `loading` en conservant le
 * bouton focusable et annoncé (aria-busy) plutôt que de le démonter, pour
 * ne pas casser le focus clavier en cours d'interaction.
 */
export const Button = forwardRef(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled = false,
    type = 'button',
    children,
    ...rest
  },
  ref,
) {
  const { t } = useTranslation();
  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      type={type}
      className={`gds-button gds-button--${variant} gds-button--${size}${loading ? ' gds-button--loading' : ''}`}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="gds-button__spinner" aria-hidden="true" /> : null}
      <span className="gds-button__label">{children}</span>
      {loading ? <span className="gds-visually-hidden">{t('button.loading')}</span> : null}
    </button>
  );
});

Button.displayName = 'Button';

export { VARIANTS as BUTTON_VARIANTS, SIZES as BUTTON_SIZES };
