import { forwardRef, useId } from 'react';
import './Checkbox.css';

/**
 * Case à cocher générique : la zone cliquable (label + case) fait au
 * minimum 44px de haut pour rester exploitable au tactile et le focus
 * clavier reste visible sur l'élément natif `input`.
 */
export const Checkbox = forwardRef(function Checkbox({ label, id, ...rest }, ref) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;

  return (
    <label htmlFor={fieldId} className="gds-checkbox">
      <input ref={ref} id={fieldId} type="checkbox" className="gds-checkbox__input" {...rest} />
      <span className="gds-checkbox__label">{label}</span>
    </label>
  );
});

Checkbox.displayName = 'Checkbox';
