import { forwardRef, useState } from 'react';
import { useTranslation } from '../design-system/index.js';
import { Icon } from '../components/shared.jsx';
import { Highlight } from '../components/SearchResultCard.jsx';
import { highlightParts } from '../genealogy/search-text.js';

const fold = (value) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Raccourci clavier affiché en pastille : c'est une touche, pas un texte,
// et il reste le même quelle que soit la langue.
const SHORTCUT = '⌘K';

/**
 * Recherche rapide d'une personne (⌘K / Ctrl+K) : liste déroulante
 * accessible (combobox ARIA), flèches pour parcourir, Entrée pour ouvrir.
 */
export const QuickSearch = forwardRef(function QuickSearch({ persons, lifespans, onPick }, ref) {
  const { t } = useTranslation();
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
        aria-label={t('quickSearch.ariaLabel', 'Rechercher une personne (Ctrl+K)')}
        aria-expanded={open}
        aria-controls="quick-search-results"
        aria-activedescendant={open ? `quick-search-${matches[active]?.id}` : undefined}
        aria-autocomplete="list"
        placeholder={t('quickSearch.placeholder', 'Rechercher une personne…')}
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
        {SHORTCUT}
      </kbd>
      {open ? (
        <div className="quick-search__panel">
          <ul id="quick-search-results" role="listbox" className="quick-search__results">
            {matches.map((person, index) => {
              const span = lifespans?.get(person.id);
              return (
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
                  onMouseMove={() => active !== index && setActive(index)}
                >
                  <span className="quick-search__avatar" aria-hidden="true">
                    <Icon name="person" />
                  </span>
                  <span className="quick-search__text">
                    <span className="person-name">
                      <Highlight
                        parts={highlightParts(
                          `${person.given_names} ${person.family_name}`,
                          query.trim(),
                        )}
                      />
                    </span>
                    <span className="quick-search__meta">
                      {span?.label ? <span className="data-id">{span.label}</span> : null}
                      {span?.birthPlace ? (
                        <span className="quick-search__place">{span.birthPlace}</span>
                      ) : null}
                      {!span?.label ? <span className="data-id">#{person.id}</span> : null}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="quick-search__hint" aria-hidden="true">
            {t('quickSearch.hint', '↑↓ parcourir · Entrée ouvrir · Échap fermer')}
          </p>
        </div>
      ) : query.trim() ? (
        <div className="quick-search__panel">
          <p className="quick-search__empty" role="status">
            {t('quickSearch.noMatch', { term: query.trim() }, 'Aucune personne ne correspond.')}
          </p>
        </div>
      ) : null}
    </div>
  );
});
