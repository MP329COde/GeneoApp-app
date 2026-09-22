import { forwardRef, useId } from 'react';
import { useTranslation } from '../../i18n/I18nProvider.jsx';
import './TextField.css';

/**
 * Champ de texte générique. Le label est toujours lié via `htmlFor`/`id`
 * (jamais de placeholder-as-label) et l'erreur est annoncée par
 * `aria-describedby` + `role="alert"` pour les lecteurs d'écran.
 */
export const TextField = forwardRef(function TextField(
  { label, hint, error, required = false, id, ...rest },
  ref,
) {
  const { t } = useTranslation();
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="gds-textfield">
      <label htmlFor={fieldId} className="gds-textfield__label">
        {label}
        <span className="gds-textfield__requirement">
          {required ? t('textfield.required') : t('textfield.optional')}
        </span>
      </label>
      <input
        ref={ref}
        id={fieldId}
        className="gds-textfield__input"
        required={required}
        aria-required={required || undefined}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={describedBy}
        {...rest}
      />
      {hint ? (
        <p id={hintId} className="gds-textfield__hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="gds-textfield__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
});

TextField.displayName = 'TextField';
