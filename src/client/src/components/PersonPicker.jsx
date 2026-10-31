import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from '../design-system/index.js';
import { personLabel } from './shared.jsx';
import { PersonAvatar } from './PersonAvatar.jsx';

const MAX_OPTIONS = 50;

function normalize(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/**
 * Sélecteur de personne avec recherche : combobox ARIA 1.2 (liste filtrable).
 * Flèches haut/bas pour parcourir, Entrée pour choisir, Échap pour fermer.
 * `value` est l'identifiant choisi (ou ''), `onChange(id | '')` le notifie.
 */
export function PersonPicker({
  label,
  persons,
  value,
  onChange,
  excludeIds = [],
  lifespans,
  inputRef,
  disabled = false,
}) {
  const { t } = useTranslation();
  const uid = useId();
  const listId = `${uid}-list`;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const localRef = useRef(null);
  const input = inputRef ?? localRef;
  const listRef = useRef(null);

  const chosen = useMemo(
    () => (value === '' ? null : persons.find((p) => String(p.id) === String(value))),
    [persons, value],
  );

  const excluded = useMemo(() => new Set(excludeIds.map(String)), [excludeIds]);

  const matches = useMemo(() => {
    const words = normalize(query).trim().split(/\s+/).filter(Boolean);
    return persons
      .filter((p) => !excluded.has(String(p.id)))
      .filter((p) => {
        if (words.length === 0) return true;
        const info = lifespans?.get(p.id);
        const haystack = normalize(
          `${p.given_names} ${p.family_name} ${info?.label ?? ''} ${info?.birthPlace ?? ''}`,
        );
        return words.every((word) => haystack.includes(word));
      })
      .slice(0, MAX_OPTIONS);
  }, [persons, excluded, query, lifespans]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView?.({ block: 'nearest' });
  }, [active, open]);

  const choose = (person) => {
    onChange(person ? String(person.id) : '');
    setQuery('');
    setOpen(false);
  };

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) setOpen(true);
      else setActive((i) => Math.min(i + 1, matches.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Home' && open) {
      event.preventDefault();
      setActive(0);
    } else if (event.key === 'End' && open) {
      event.preventDefault();
      setActive(Math.max(matches.length - 1, 0));
    } else if (event.key === 'Enter' && open && matches[active]) {
      event.preventDefault();
      choose(matches[active]);
    } else if (event.key === 'Escape' && open) {
      // Referme la liste sans fermer le formulaire parent.
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
  };

  const activeId = open && matches[active] ? `${uid}-opt-${matches[active].id}` : undefined;
  const statusText = open
    ? matches.length === 0
      ? t('picker.noResult', 'Aucune personne trouvée')
      : t('picker.count', { count: matches.length }, '{count} personne(s) trouvée(s)')
    : '';
  const showChosen = Boolean(chosen) && !open;

  return (
    <div className="person-picker">
      <label htmlFor={`${uid}-input`} className="person-picker__label">
        {label}
      </label>
      {showChosen ? (
        <div className="person-picker__chosen">
          <PersonAvatar person={chosen} size={28} />
          <span className="person-picker__chosen-name">{personLabel(chosen)}</span>
          <button
            type="button"
            className="person-picker__clear"
            aria-label={t('picker.clear', { name: personLabel(chosen) }, 'Changer : {name}')}
            onClick={() => {
              onChange('');
              setOpen(true);
              setTimeout(() => input.current?.focus(), 0);
            }}
            disabled={disabled}
          >
            {t('picker.change', 'Changer')}
          </button>
        </div>
      ) : null}
      <input
        ref={input}
        id={`${uid}-input`}
        className="person-picker__input"
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        autoComplete="off"
        spellCheck={false}
        placeholder={t('picker.placeholder', 'Rechercher une personne…')}
        value={query}
        disabled={disabled}
        hidden={showChosen}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      <ul
        id={listId}
        ref={listRef}
        role="listbox"
        aria-label={label}
        className="person-picker__list"
        hidden={!open}
      >
        {matches.map((person, index) => {
          const info = lifespans?.get(person.id);
          return (
            // Le clavier est géré par le champ combobox (aria-activedescendant).
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events
            <li
              key={person.id}
              id={`${uid}-opt-${person.id}`}
              role="option"
              aria-selected={index === active}
              className={`person-picker__option${index === active ? ' is-active' : ''}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(person)}
              onMouseMove={() => setActive(index)}
            >
              <PersonAvatar person={person} size={28} />
              <span className="person-picker__option-text">
                <span className="person-picker__option-name">{personLabel(person)}</span>
                {info?.label || info?.birthPlace ? (
                  <span className="person-picker__option-meta">
                    {[info.label, info.birthPlace].filter(Boolean).join(' · ')}
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="gds-visually-hidden" role="status" aria-live="polite">
        {statusText}
      </p>
    </div>
  );
}
