import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button, useTranslation } from '../design-system/index.js';
import { client } from '../api/app-client.js';
import { ErrorNotice, Icon, personLabel } from '../components/shared.jsx';
import {
  Highlight,
  RESULT_TYPES,
  ResultSkeleton,
  SearchResultCard,
} from '../components/SearchResultCard.jsx';
import {
  closestNames,
  fold,
  frequentFamilyNames,
  highlightParts,
} from '../genealogy/search-text.js';
import { AdvancedSearch } from './AdvancedSearch.jsx';
import { SiteSearch } from './SiteSearch.jsx';

const RECENT_KEY = 'geneoapp:recentSearches';
const RECENT_MAX = 5;
const TYPE_ORDER = Object.keys(RESULT_TYPES);
// Section ouverte quand on clique sur un résultat qui n'est pas une personne.
const TYPE_VIEWS = {
  SOURCE: 'sources',
  MEDIA: 'media',
  PLACE: 'map',
  EVENT: 'timeline',
  UNION: 'families',
  PARENTAGE: 'families',
};
// Au-delà de ce délai, une recherche encore en cours affiche des cartes fantômes
// (sinon elles ne feraient que clignoter).
const SKELETON_DELAY_MS = 150;

function readRecent() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(stored) ? stored.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function writeRecent(list) {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // Les recherches récentes restent facultatives si le stockage échoue.
  }
}

/**
 * Écran Recherche : barre principale avec suggestions de personnes, résultats
 * en cartes groupées par type, puis filtres avancés et recherche multi-sites.
 */
export function SearchPanel({
  onNavigate,
  onOpenView,
  selected,
  lifespan,
  persons = [],
  lifespans = new Map(),
}) {
  const { t } = useTranslation();
  const listboxId = useId();
  const inputRef = useRef(null);
  const resultsRef = useRef(null);
  const [term, setTerm] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [results, setResults] = useState(null);
  const [searchError, setSearchError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [typeFilter, setTypeFilter] = useState(null);
  const [recent, setRecent] = useState(readRecent);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [active, setActive] = useState(-1);

  useEffect(() => {
    if (!busy) {
      setShowSkeleton(false);
      return undefined;
    }
    const timer = setTimeout(() => setShowSkeleton(true), SKELETON_DELAY_MS);
    return () => clearTimeout(timer);
  }, [busy]);

  const suggestions = useMemo(() => {
    const wanted = fold(term.trim());
    if (wanted.length < 2) return [];
    return persons.filter((person) => fold(personLabel(person)).includes(wanted)).slice(0, 5);
  }, [persons, term]);
  const suggestionsVisible = suggestOpen && suggestions.length > 0;

  const runSearch = async (value) => {
    const query = value.trim();
    if (!query) return;
    setTerm(query);
    setSubmitted(query);
    setSuggestOpen(false);
    setActive(-1);
    setSearchError(null);
    setTypeFilter(null);
    setBusy(true);
    try {
      setResults(await client.search.query(query));
      const next = [query, ...recent.filter((item) => fold(item) !== fold(query))].slice(
        0,
        RECENT_MAX,
      );
      setRecent(next);
      writeRecent(next);
    } catch (queryError) {
      setSearchError(queryError.message);
      setResults(null);
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const picked = suggestionsVisible ? suggestions[active] : null;
    if (picked) {
      onNavigate(picked.id);
      return;
    }
    runSearch(term);
  };

  const handleInputKeys = (event) => {
    if (event.key === 'ArrowDown') {
      if (suggestionsVisible) {
        event.preventDefault();
        setActive((active + 1) % suggestions.length);
      } else if (results?.length) {
        event.preventDefault();
        resultsRef.current?.querySelector('[data-result-card]')?.focus();
      }
    } else if (event.key === 'ArrowUp' && suggestionsVisible) {
      event.preventDefault();
      setActive((active - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === 'Escape') {
      if (suggestionsVisible) {
        event.preventDefault();
        setSuggestOpen(false);
        setActive(-1);
      }
    }
  };

  const openResult = (result) => {
    if (result.entity_type === 'PERSON') onNavigate(result.entity_id);
    else if (TYPE_VIEWS[result.entity_type]) onOpenView?.(TYPE_VIEWS[result.entity_type]);
  };

  const personFacts = (id) => {
    const span = lifespans.get(id);
    return { dates: span?.label, place: span?.birthPlace };
  };

  const counts = useMemo(() => {
    const byType = new Map();
    for (const result of results ?? []) {
      byType.set(result.entity_type, (byType.get(result.entity_type) ?? 0) + 1);
    }
    return byType;
  }, [results]);
  const presentTypes = TYPE_ORDER.filter((type) => counts.has(type)).concat(
    [...counts.keys()].filter((type) => !TYPE_ORDER.includes(type)),
  );
  const visibleTypes = typeFilter ? [typeFilter] : presentTypes;
  const typeLabel = (type, plural) => {
    const meta = RESULT_TYPES[type];
    return meta ? t(plural ? meta.plural : meta.label, type) : type;
  };

  const familyHints = useMemo(() => frequentFamilyNames(persons), [persons]);
  const didYouMean = useMemo(
    () => (results && results.length === 0 ? closestNames(submitted, persons) : []),
    [results, submitted, persons],
  );
  const startSuggestions = [
    ...recent,
    ...familyHints.filter((name) => !recent.some((item) => fold(item) === fold(name))),
  ].slice(0, 6);

  return (
    <div className="search-panel">
      <section className="search-hero" aria-labelledby="search-hero-title">
        <h2 id="search-hero-title" className="search-hero__title">
          {t('searchPanel.hero.title', 'Rechercher dans vos archives')}
        </h2>
        <p className="search-hero__lead">
          {t(
            'searchPanel.hero.lead',
            'Personnes, lieux, sources, médias et notes : une seule barre, les orthographes proches sont retrouvées.',
          )}
        </p>
        <form role="search" onSubmit={handleSubmit} className="search-hero__form">
          <div className="search-hero__field">
            <span className="search-hero__icon" aria-hidden="true">
              <Icon name="search" />
            </span>
            <input
              ref={inputRef}
              className="search-hero__input"
              type="search"
              role="combobox"
              aria-label={t('searchPanel.label')}
              aria-expanded={suggestionsVisible}
              aria-controls={suggestionsVisible ? listboxId : undefined}
              aria-activedescendant={
                suggestionsVisible && active >= 0 ? `${listboxId}-${active}` : undefined
              }
              aria-autocomplete="list"
              autoComplete="off"
              value={term}
              placeholder={t('searchPanel.placeholder')}
              onChange={(event) => {
                setTerm(event.target.value);
                setSuggestOpen(true);
                setActive(-1);
              }}
              onBlur={() => setSuggestOpen(false)}
              onFocus={() => setSuggestOpen(true)}
              onKeyDown={handleInputKeys}
            />
            {suggestionsVisible ? (
              <ul id={listboxId} role="listbox" className="search-hero__suggestions">
                {suggestions.map((person, index) => {
                  const facts = personFacts(person.id);
                  return (
                    <li
                      key={person.id}
                      id={`${listboxId}-${index}`}
                      role="option"
                      aria-selected={index === active}
                      className={index === active ? 'is-active' : ''}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        onNavigate(person.id);
                      }}
                    >
                      <span className="search-hero__suggestion-name">
                        <Highlight parts={highlightParts(personLabel(person), term)} />
                      </span>
                      <span className="data-id">{facts.dates ?? `#${person.id}`}</span>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
          <Button type="submit" disabled={busy}>
            {t('searchPanel.submit')}
          </Button>
        </form>
      </section>

      {searchError ? <ErrorNotice message={searchError} /> : null}

      <div ref={resultsRef} className="search-results-area" aria-busy={busy}>
        {busy && showSkeleton ? (
          <>
            <p role="status" className="gds-visually-hidden">
              {t('searchPanel.loading', 'Recherche en cours…')}
            </p>
            <ResultSkeleton />
          </>
        ) : null}

        {!busy && results === null && !searchError ? (
          <div className="search-empty">
            <span className="search-empty__icon" aria-hidden="true">
              <Icon name="sparkle" />
            </span>
            <h3 className="search-empty__title">
              {persons.length === 0
                ? t('searchPanel.empty.noTree', 'Votre arbre est encore vide')
                : t('searchPanel.empty.title', 'Que cherchez-vous ?')}
            </h3>
            <p className="search-empty__text">
              {persons.length === 0
                ? t(
                    'searchPanel.empty.noTreeText',
                    'Ajoutez des personnes ou importez un fichier GEDCOM, puis revenez chercher ici.',
                  )
                : t(
                    'searchPanel.empty.text',
                    'Tapez un nom, un lieu ou un titre de source. Les premières lettres suffisent.',
                  )}
            </p>
            {startSuggestions.length > 0 ? (
              <div className="search-empty__tries">
                <span className="search-empty__tries-label">
                  {t('searchPanel.empty.try', 'Essayez :')}
                </span>
                <ul className="chip-list">
                  {startSuggestions.map((name) => (
                    <li key={name}>
                      <button type="button" className="chip" onClick={() => runSearch(name)}>
                        {name}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        {!busy && results !== null && results.length === 0 ? (
          <div className="search-empty search-empty--none" role="status">
            <span className="search-empty__icon" aria-hidden="true">
              <Icon name="search" />
            </span>
            <h3 className="search-empty__title">
              {t('searchPanel.noResult', { term: submitted })}
            </h3>
            {didYouMean.length > 0 ? (
              <div className="search-empty__tries">
                <span className="search-empty__tries-label">
                  {t('searchPanel.didYouMean', 'Vouliez-vous dire :')}
                </span>
                <ul className="chip-list">
                  {didYouMean.map((name) => (
                    <li key={name}>
                      <button type="button" className="chip" onClick={() => runSearch(name)}>
                        {name}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <ul className="search-empty__tips">
              <li>
                {t('searchPanel.tip.spelling', 'Vérifiez l’orthographe ou tapez moins de lettres.')}
              </li>
              <li>{t('searchPanel.tip.oneWord', 'Essayez un seul mot : le nom ou le lieu.')}</li>
              <li>
                {t(
                  'searchPanel.tip.filters',
                  'Les filtres avancés ci-dessous cherchent par période, source ou profession.',
                )}
              </li>
            </ul>
          </div>
        ) : null}

        {!busy && results !== null && results.length > 0 ? (
          <div className="search-results-groups">
            <div className="search-summary">
              <p className="search-summary__count" role="status">
                {t(
                  'searchPanel.resultSummary',
                  { count: results.length, term: submitted },
                  `${results.length} résultat(s) pour « ${submitted} »`,
                )}
              </p>
              {presentTypes.length > 1 ? (
                <ul
                  className="chip-list"
                  aria-label={t('searchPanel.filterByType', 'Filtrer par type')}
                >
                  <li>
                    <button
                      type="button"
                      className="chip"
                      aria-pressed={typeFilter === null}
                      onClick={() => setTypeFilter(null)}
                    >
                      {t('searchPanel.allTypes', 'Tout')}{' '}
                      <span className="chip__count">{results.length}</span>
                    </button>
                  </li>
                  {presentTypes.map((type) => (
                    <li key={type}>
                      <button
                        type="button"
                        className="chip"
                        aria-pressed={typeFilter === type}
                        onClick={() => setTypeFilter(typeFilter === type ? null : type)}
                      >
                        {typeLabel(type, true)}{' '}
                        <span className="chip__count">{counts.get(type)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            {visibleTypes.map((type) => (
              <section key={type} className="result-group" aria-labelledby={`result-group-${type}`}>
                <h3 id={`result-group-${type}`} className="result-group__title">
                  {typeLabel(type, true)}
                  <span className="result-group__count">{counts.get(type)}</span>
                </h3>
                <ul className="result-cards">
                  {results
                    .filter((result) => result.entity_type === type)
                    .map((result) => {
                      const facts =
                        type === 'PERSON' ? personFacts(result.entity_id) : { dates: null };
                      return (
                        <SearchResultCard
                          key={`${result.entity_type}:${result.entity_id}`}
                          type={type}
                          title={result.title}
                          term={submitted}
                          dates={facts.dates}
                          place={facts.place}
                          id={type === 'PERSON' ? result.entity_id : null}
                          excerpt={result.excerpt}
                          onOpen={() => openResult(result)}
                        />
                      );
                    })}
                </ul>
              </section>
            ))}
          </div>
        ) : null}
      </div>

      <AdvancedSearch client={client} onNavigate={onNavigate} lifespans={lifespans} />
      <SiteSearch key={selected?.id ?? 'none'} person={selected} lifespan={lifespan} />
    </div>
  );
}
