import { useState } from 'react';
import { Button } from '../design-system/index.js';
import { formatGenealogyDate } from '../../../db/src/dates/genealogy-date.js';
import { EVENT_LABELS } from './PersonTimeline.jsx';

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
      <h3 id="advanced-search-title">Filtres avancés</h3>
      <form onSubmit={handleSubmit} className="advanced-search__form">
        <label>
          <span>Nom</span>
          <input value={filters.familyName} onChange={set('familyName')} />
        </label>
        <label>
          <span>Prénom(s)</span>
          <input value={filters.givenNames} onChange={set('givenNames')} />
        </label>
        <label>
          <span>Sexe</span>
          <select value={filters.sex} onChange={set('sex')}>
            <option value="">Tous</option>
            <option value="M">Homme</option>
            <option value="F">Femme</option>
            <option value="U">Inconnu</option>
          </select>
        </label>
        <label>
          <span>Lieu</span>
          <input value={filters.place} onChange={set('place')} />
        </label>
        <label>
          <span>Type d’événement</span>
          <select value={filters.eventType} onChange={set('eventType')}>
            <option value="">Tous</option>
            {Object.entries(EVENT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Année de début</span>
          <input
            type="number"
            inputMode="numeric"
            value={filters.yearFrom}
            onChange={set('yearFrom')}
          />
        </label>
        <label>
          <span>Année de fin</span>
          <input
            type="number"
            inputMode="numeric"
            value={filters.yearTo}
            onChange={set('yearTo')}
          />
        </label>
        <label>
          <span>Source citée</span>
          <input value={filters.source} onChange={set('source')} />
        </label>
        <label>
          <span>Identifiant (#12 ou externe)</span>
          <input value={filters.identifier} onChange={set('identifier')} />
        </label>
        <label className="settings-toggle">
          <input type="checkbox" checked={filters.fuzzy} onChange={set('fuzzy')} />
          <span>Orthographes proches (Dupont, Dupond, Dupon…)</span>
        </label>
        <div className="advanced-search__actions">
          <Button type="submit" disabled={busy}>
            Filtrer
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setFilters(EMPTY);
              setResult(null);
            }}
          >
            Effacer les filtres
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
            {result.total} personne(s)
            {result.total > result.results.length ? ` (${result.results.length} affichées)` : ''}
          </p>
          {result.results.length === 0 ? (
            <p className="notice">Aucune personne ne correspond à ces filtres.</p>
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
                    <span className="data-id">proximité {Math.round(score * 100)} %</span>
                  ) : null}
                  {matchedEvents.map((event) => (
                    <span key={event.id} className="data-id">
                      {EVENT_LABELS[event.type] ?? event.type}{' '}
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
