import { forwardRef, useId } from 'react';
import './Switch.css';

/**
 * Interrupteur à bascule (rôle ARIA `switch`) : une case native stylée, donc
 * clavier (Espace) et lecteurs d'écran fonctionnent sans code supplémentaire.
 * L'état est aussi écrit en toutes lettres (`stateLabel`) : la couleur ne
 * porte jamais seule l'information.
 */
export const Switch = forwardRef(function Switch(
  { label, description, stateLabel, id, className = '', ...rest },
  ref,
) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const descriptionId = description ? `${fieldId}-description` : undefined;
  return (
    <div className={`gds-switch ${className}`.trim()}>
      <label htmlFor={fieldId} className="gds-switch__row">
        <span className="gds-switch__control">
          <input
            ref={ref}
            id={fieldId}
            type="checkbox"
            role="switch"
            className="gds-switch__input"
            aria-describedby={descriptionId}
            {...rest}
          />
          <span className="gds-switch__track" aria-hidden="true" />
        </span>
        <span className="gds-switch__label">{label}</span>
        {stateLabel ? <span className="gds-switch__state">{stateLabel}</span> : null}
      </label>
      {description ? (
        <p id={descriptionId} className="gds-switch__description">
          {description}
        </p>
      ) : null}
    </div>
  );
});

Switch.displayName = 'Switch';
