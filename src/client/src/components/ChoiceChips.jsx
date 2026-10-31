import { useId } from 'react';

/**
 * Choix unique parmi quelques options, présenté en pastilles (boutons radio
 * natifs : flèches du clavier, lecteurs d'écran). L'option choisie porte une
 * coche en plus de la couleur.
 */
export function ChoiceChips({ legend, options, value, onChange }) {
  const name = useId();
  return (
    <fieldset className="choice-chips">
      <legend className="choice-chips__legend">{legend}</legend>
      <div className="choice-chips__row">
        {options.map((option) => (
          <label
            key={option.value}
            className={`choice-chip${value === option.value ? ' is-checked' : ''}`}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
