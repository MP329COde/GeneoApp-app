import { useId, useState } from 'react';
import { Button, useTranslation } from '../design-system/index.js';
import { formatGenealogyDate } from '../../../db/src/dates/genealogy-date.js';
import { useEventLabels } from '../genealogy/event-labels.js';
import { Icon } from '../components/shared.jsx';
import { ResultSkeleton, SearchResultCard } from '../components/SearchResultCard.jsx';

const EMPTY = {
  familyName: '',
  givenNames: '',
  sex: '',
  place: '',
  yearFrom: '',
  yearTo: '',
  eventType: '',
  source: '',
  identifier: '',
  occupation: '',
  note: '',
  fuzzy: true,
};

// Filtres avancés : nom et prénom (flou / phonétique), lieu, période, type
// d'événement, source citée et identifiant. Calcul côté moteur local. Le
// formulaire est replié par défaut : les filtres en vigueur restent visibles
// sous forme de puces que l'on peut retirer une à une.
export function AdvancedSearch({ client, onNavigate, lifespans = new Map() }) {
  const { t } = useTranslation();
  const eventLabels = useEventLabels();
  const panelId = useId();
  const [filters, setFilters] = useState(EMPTY);
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (key) => (event) =>
    setFilters({
      ...filters,
      [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value,
    });

  const sexLabels = {
    M: t('advancedSearch.sexMale', 'Homme'),
    F: t('advancedSearch.sexFemale', 'Femme'),
    U: t('advancedSearch.sexUnknown', 'Inconnu'),
  };
  const displayValue = (key, value) =>
    key === 'sex'
      ? (sexLabels[value] ?? value)
      : key === 'eventType'
        ? (eventLabels[value] ?? value)
        : value;

  // Ordre d'affichage des puces de filtres actifs.
  const chipFields = [
    ['familyName', t('advancedSearch.familyName', 'Nom')],
    ['givenNames', t('advancedSearch.givenNames', 'Prénom(s)')],
    ['sex', t('advancedSearch.sex', 'Sexe')],
    ['place', t('advancedSearch.place', 'Lieu')],
    ['eventType', t('advancedSearch.eventType', 'Type d’événement')],
    ['yearFrom', t('advancedSearch.yearFrom', 'Année de début')],
    ['yearTo', t('advancedSearch.yearTo', 'Année de fin')],
    ['source', t('advancedSearch.source', 'Source citée')],
    ['identifier', t('advancedSearch.identifier', 'Identifiant (#12 ou externe)')],
    ['occupation', t('advancedSearch.occupation', 'Profession')],
    ['note', t('advancedSearch.note', 'Texte d’une note')],
  ];
  const chips = [
    ...chipFields
      .filter(([key]) => filters[key] !== '')
      .map(([key, label]) => ({ key, label, value: displayValue(key, filters[key]) })),
    ...(filters.fuzzy
      ? []
      : [
          {
            key: 'fuzzy',
            label: t('advancedSearch.exact', 'Orthographe exacte'),
            value: null,
          },
        ]),
  ];

  const run = async (next) => {
    setBusy(true);
    setError(null);
    try {
      const payload = Object.fromEntries(
        Object.entries(next).filter(([key, value]) => key === 'fuzzy' || value !== ''),
      );
      setResult(await client.advancedSearch(payload));
    } catch (searchError) {
      setError(searchError.message);
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    await run(filters);
    setOpen(false);
  };

  const removeChip = (key) => {
    const next = { ...filters, [key]: key === 'fuzzy' ? true : '' };
    setFilters(next);
    if (result) run(next);
  };

  const clearAll = () => {
    setFilters(EMPTY);
    setResult(null);
    setError(null);
  };

  const eventLines = (matchedEvents) =>
    matchedEvents.map(
      (event) =>
        `${eventLabels[event.type] ?? event.type} ${formatGenealogyDate(event.dateText ?? '')}${
          event.place ? ` · ${event.place}` : ''
        }`,
    );

  const field = (key, label, props = {}) => (
    <label>
      <span>{label}</span>
      <input value={filters[key]} onChange={set(key)} {...props} />
    </label>
  );

  return (
    <section className="advanced-search" aria-labelledby="advanced-search-title">
      <div className="advanced-search__head">
        <h3 id="advanced-search-title">{t('advancedSearch.title', 'Filtres avancés')}</h3>
        <button
          type="button"
          className="filters-toggle"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onClick={() => setOpen(!open)}
        >
          <Icon name="filter" />
          <span>
            {chips.length > 0
              ? t(
                  'advancedSearch.toggleActive',
                  { count: chips.length },
                  `Filtres (${chips.length} actifs)`,
                )
              : t('advancedSearch.toggle', 'Filtres')}
          </span>
          <span className={`filters-toggle__chevron${open ? ' is-open' : ''}`}>
            <Icon name="chevron-down" />
          </span>
        </button>
      </div>
      <p className="settings-hint">
        {t(
          'advancedSearch.hint',
          'Affinez par nom, lieu, période, source ou profession. Les résultats viennent de votre arbre, hors ligne.',
        )}
      </p>
      {chips.length > 0 ? (
        <ul className="chip-list" aria-label={t('advancedSearch.activeFilters', 'Filtres actifs')}>
          {chips.map((chip) => (
            <li key={chip.key}>
              <span className="chip chip--removable">
                <span className="chip__text">
                  {chip.value === null ? chip.label : `${chip.label} : ${chip.value}`}
                </span>
                <button
                  type="button"
                  className="chip__remove"
                  aria-label={t(
                    'advancedSearch.removeFilter',
                    { name: chip.label },
                    `Retirer le filtre ${chip.label}`,
                  )}
                  onClick={() => removeChip(chip.key)}
                >
                  <Icon name="close" />
                </button>
              </span>
            </li>
          ))}
          <li>
            <button type="button" className="link-button link-button--small" onClick={clearAll}>
              {t('advancedSearch.clear', 'Effacer les filtres')}
            </button>
          </li>
        </ul>
      ) : null}
      {open ? (
        <form id={panelId} onSubmit={handleSubmit} className="advanced-search__form">
          <fieldset className="advanced-search__group">
            <legend>{t('advancedSearch.group.identity', 'Identité')}</legend>
            {field('familyName', t('advancedSearch.familyName', 'Nom'))}
            {field('givenNames', t('advancedSearch.givenNames', 'Prénom(s)'))}
            <label>
              <span>{t('advancedSearch.sex', 'Sexe')}</span>
              <select value={filters.sex} onChange={set('sex')}>
                <option value="">{t('advancedSearch.all', 'Tous')}</option>
                <option value="M">{sexLabels.M}</option>
                <option value="F">{sexLabels.F}</option>
                <option value="U">{sexLabels.U}</option>
              </select>
            </label>
            {field('occupation', t('advancedSearch.occupation', 'Profession'))}
          </fieldset>
          <fieldset className="advanced-search__group">
            <legend>{t('advancedSearch.group.when', 'Lieu et période')}</legend>
            {field('place', t('advancedSearch.place', 'Lieu'))}
            <label>
              <span>{t('advancedSearch.eventType', 'Type d’événement')}</span>
              <select value={filters.eventType} onChange={set('eventType')}>
                <option value="">{t('advancedSearch.all', 'Tous')}</option>
                {Object.entries(eventLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {field('yearFrom', t('advancedSearch.yearFrom', 'Année de début'), {
              type: 'number',
              inputMode: 'numeric',
            })}
            {field('yearTo', t('advancedSearch.yearTo', 'Année de fin'), {
              type: 'number',
              inputMode: 'numeric',
            })}
          </fieldset>
          <fieldset className="advanced-search__group">
            <legend>{t('advancedSearch.group.records', 'Sources et notes')}</legend>
            {field('source', t('advancedSearch.source', 'Source citée'))}
            {field('identifier', t('advancedSearch.identifier', 'Identifiant (#12 ou externe)'))}
            {field('note', t('advancedSearch.note', 'Texte d’une note'))}
          </fieldset>
          <label className="settings-toggle advanced-search__fuzzy">
            <input type="checkbox" checked={filters.fuzzy} onChange={set('fuzzy')} />
            <span>
              {t('advancedSearch.fuzzy', 'Orthographes proches (Dupont, Dupond, Dupon…)')}
            </span>
          </label>
          <div className="advanced-search__actions">
            <Button type="submit" disabled={busy}>
              {t('advancedSearch.submit', 'Filtrer')}
            </Button>
            <Button type="button" variant="secondary" onClick={clearAll}>
              {t('advancedSearch.clear', 'Effacer les filtres')}
            </Button>
          </div>
        </form>
      ) : null}
      {error ? (
        <p role="alert" className="notice notice--error">
          {error}
        </p>
      ) : null}
      {busy && !result ? <ResultSkeleton count={2} /> : null}
      {result ? (
        <div aria-live="polite">
          <p className="search-summary__count">
            {t(
              'advancedSearch.resultCount',
              {
                count: result.total,
                shown: result.results.length,
              },
              `${result.total} personne(s)`,
            )}
            {result.total > result.results.length
              ? ` (${t('advancedSearch.shownCount', { count: result.results.length }, `${result.results.length} affichées`)})`
              : ''}
          </p>
          {result.results.length === 0 ? (
            <div className="search-empty search-empty--none">
              <span className="search-empty__icon" aria-hidden="true">
                <Icon name="search" />
              </span>
              <h4 className="search-empty__title">
                {t('advancedSearch.noMatch', 'Aucune personne ne correspond à ces filtres.')}
              </h4>
              <p className="search-empty__text">
                {t(
                  'advancedSearch.noMatchHint',
                  'Retirez un filtre à l’aide des puces ci-dessus, ou élargissez la période.',
                )}
              </p>
            </div>
          ) : (
            <ul className="result-cards">
              {result.results.map(({ person, score, matchedEvents }) => {
                const span = lifespans.get(person.id);
                return (
                  <SearchResultCard
                    key={person.id}
                    type="PERSON"
                    title={`${person.given_names} ${person.family_name}`}
                    dates={span?.label}
                    place={span?.birthPlace}
                    id={person.id}
                    extras={[
                      ...(score < 1
                        ? [
                            t(
                              'advancedSearch.proximity',
                              { count: Math.round(score * 100) },
                              `proximité ${Math.round(score * 100)} %`,
                            ),
                          ]
                        : []),
                      ...eventLines(matchedEvents),
                    ]}
                    onOpen={() => onNavigate(person.id)}
                  />
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
