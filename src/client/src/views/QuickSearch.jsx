import { forwardRef, useState } from 'react';

const fold = (value) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Recherche rapide d'une personne (⌘K / Ctrl+K) : liste déroulante
 * accessible (combobox ARIA), flèches pour parcourir, Entrée pour ouvrir.
 */
export const QuickSearch = forwardRef(function QuickSearch({ persons, lifespans, onPick }, ref) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const matches = query.trim()
    ? persons
        .filter((person) =>
          fold(`${person.given_names} ${person.family_name}`).includes(fold(query.trim())),
        )
        .slice(0, 8)
    : [];
  const open = matches.length > 0;

  const pick = (person) => {
    onPick(person.id);
    setQuery('');
    setActive(0);
  };

  return (
    <div className="quick-search">
      <input
        ref={ref}
        type="search"
        role="combobox"
        aria-label="Rechercher une personne (Ctrl+K)"
        aria-expanded={open}
        aria-controls="quick-search-results"
        aria-activedescendant={open ? `quick-search-${matches[active]?.id}` : undefined}
        aria-autocomplete="list"
        placeholder="Rechercher une personne…"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && open) {
            event.preventDefault();
            setActive((active + 1) % matches.length);
          } else if (event.key === 'ArrowUp' && open) {
            event.preventDefault();
            setActive((active - 1 + matches.length) % matches.length);
          } else if (event.key === 'Enter' && open) {
            event.preventDefault();
            pick(matches[active]);
          } else if (event.key === 'Escape') {
            setQuery('');
          }
        }}
      />
      <kbd className="quick-search__kbd" aria-hidden="true">
        ⌘K
      </kbd>
      {open ? (
        <ul id="quick-search-results" role="listbox" className="quick-search__results">
          {matches.map((person, index) => (
            <li
              key={person.id}
              id={`quick-search-${person.id}`}
              role="option"
              aria-selected={index === active}
              className={index === active ? 'is-active' : ''}
              onMouseDown={(event) => {
                event.preventDefault();
                pick(person);
              }}
            >
              <span className="person-name">
                {person.given_names} {person.family_name}
              </span>
              <span className="data-id">{lifespans?.get(person.id)?.label ?? `#${person.id}`}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
});
