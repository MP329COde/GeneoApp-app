import { useState } from 'react';
import { Button, useTranslation } from '../design-system/index.js';
import { formatGenealogyDate } from '../../../db/src/dates/genealogy-date.js';
import { useEventLabels } from '../genealogy/event-labels.js';

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
  fuzzy: true,
};

// Filtres avancés : nom et prénom (flou / phonétique), lieu, période, type
// d'événement, source citée et identifiant. Calcul côté moteur local.
export function AdvancedSearch({ client, onNavigate }) {
  const { t } = useTranslation();
  const eventLabels = useEventLabels();
  const [filters, setFilters] = useState(EMPTY);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (key) => (event) =>
    setFilters({
      ...filters,
      [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value,
    });

  const handleSubmit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = Object.fromEntries(
        Object.entries(filters).filter(([key, value]) => key === 'fuzzy' || value !== ''),
      );
      setResult(await client.advancedSearch(payload));
    } catch (searchError) {
      setError(searchError.message);
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="advanced-search" aria-labelledby="advanced-search-title">
      <h3 id="advanced-search-title">{t('advancedSearch.title', 'Filtres avancés')}</h3>
      <form onSubmit={handleSubmit} className="advanced-search__form">
        <label>
          <span>{t('advancedSearch.familyName', 'Nom')}</span>
          <input value={filters.familyName} onChange={set('familyName')} />
        </label>
        <label>
          <span>{t('advancedSearch.givenNames', 'Prénom(s)')}</span>
          <input value={filters.givenNames} onChange={set('givenNames')} />
        </label>
        <label>
          <span>{t('advancedSearch.sex', 'Sexe')}</span>
          <select value={filters.sex} onChange={set('sex')}>
            <option value="">{t('advancedSearch.all', 'Tous')}</option>
            <option value="M">{t('advancedSearch.sexMale', 'Homme')}</option>
            <option value="F">{t('advancedSearch.sexFemale', 'Femme')}</option>
            <option value="U">{t('advancedSearch.sexUnknown', 'Inconnu')}</option>
          </select>
        </label>
        <label>
          <span>{t('advancedSearch.place', 'Lieu')}</span>
          <input value={filters.place} onChange={set('place')} />
        </label>
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
        <label>
          <span>{t('advancedSearch.yearFrom', 'Année de début')}</span>
          <input
            type="number"
            inputMode="numeric"
            value={filters.yearFrom}
            onChange={set('yearFrom')}
          />
        </label>
        <label>
          <span>{t('advancedSearch.yearTo', 'Année de fin')}</span>
          <input
            type="number"
            inputMode="numeric"
            value={filters.yearTo}
            onChange={set('yearTo')}
          />
        </label>
        <label>
          <span>{t('advancedSearch.source', 'Source citée')}</span>
          <input value={filters.source} onChange={set('source')} />
        </label>
        <label>
          <span>{t('advancedSearch.identifier', 'Identifiant (#12 ou externe)')}</span>
          <input value={filters.identifier} onChange={set('identifier')} />
        </label>
        <label className="settings-toggle">
          <input type="checkbox" checked={filters.fuzzy} onChange={set('fuzzy')} />
          <span>{t('advancedSearch.fuzzy', 'Orthographes proches (Dupont, Dupond, Dupon…)')}</span>
        </label>
        <div className="advanced-search__actions">
          <Button type="submit" disabled={busy}>
            {t('advancedSearch.submit', 'Filtrer')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setFilters(EMPTY);
              setResult(null);
            }}
          >
            {t('advancedSearch.clear', 'Effacer les filtres')}
          </Button>
        </div>
      </form>
      {error ? (
        <p role="alert" className="notice notice--error">
          {error}
        </p>
      ) : null}
      {result ? (
        <div aria-live="polite">
          <p className="data-id">
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
            <p className="notice">
              {t('advancedSearch.noMatch', 'Aucune personne ne correspond à ces filtres.')}
            </p>
          ) : (
            <ul className="search-results">
              {result.results.map(({ person, score, matchedEvents }) => (
                <li key={person.id}>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => onNavigate(person.id)}
                  >
                    {person.given_names} {person.family_name}
                  </button>
                  <span className="data-id">#{person.id}</span>
                  {score < 1 ? (
                    <span className="data-id">
                      {t(
                        'advancedSearch.proximity',
                        { count: Math.round(score * 100) },
                        `proximité ${Math.round(score * 100)} %`,
                      )}
                    </span>
                  ) : null}
                  {matchedEvents.map((event) => (
                    <span key={event.id} className="data-id">
                      {eventLabels[event.type] ?? event.type}{' '}
                      {formatGenealogyDate(event.dateText ?? '')}
                      {event.place ? ` · ${event.place}` : ''}
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
