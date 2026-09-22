import { forwardRef, useId } from 'react';
import { useTranslation } from '../../i18n/I18nProvider.jsx';
import './Select.css';

/**
 * Liste déroulante native : préférée à un widget custom pour hériter
 * gratuitement du support clavier (flèches, saisie au clavier) et des
 * technologies d'assistance du système d'exploitation.
 */
export const Select = forwardRef(function Select(
  { label, hint, error, required = false, options, id, ...rest },
  ref,
) {
  const { t } = useTranslation();
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="gds-select">
      <label htmlFor={fieldId} className="gds-select__label">
        {label}
        <span className="gds-select__requirement">
          {required ? t('textfield.required') : t('textfield.optional')}
        </span>
      </label>
      <select
        ref={ref}
        id={fieldId}
        className="gds-select__control"
        required={required}
        aria-required={required || undefined}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={describedBy}
        defaultValue=""
        {...rest}
      >
        <option value="" disabled>
          {t('select.placeholder')}
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? (
        <p id={hintId} className="gds-select__hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="gds-select__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
});

Select.displayName = 'Select';
