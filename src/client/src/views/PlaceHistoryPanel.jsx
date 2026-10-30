import { useCallback, useEffect, useState } from 'react';
import { Button, useTranslation } from '../design-system/index.js';
import { ErrorNotice } from '../components/shared.jsx';

const toYear = (text) => (text.trim() === '' ? undefined : Number(text));

function period(item) {
  if (item.validFromYear == null && item.validToYear == null) return '';
  return ` (${item.validFromYear ?? '…'} – ${item.validToYear ?? '…'})`;
}

// Histoire d'un lieu : noms successifs (avec langue et période de validité) et
// rattachements hiérarchiques datés. Une date d'événement est ensuite résolue
// vers le nom et le parent en vigueur cette année-là.
export function PlaceHistoryPanel({ client, places }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [placeId, setPlaceId] = useState('');
  const [names, setNames] = useState(null);
  const [parents, setParents] = useState([]);
  const [error, setError] = useState(null);
  const [nameForm, setNameForm] = useState({ name: '', language: '', from: '', to: '' });
  const [parentForm, setParentForm] = useState({ parentPlaceId: '', from: '', to: '' });
  const [year, setYear] = useState('');
  const [resolved, setResolved] = useState(null);

  const load = useCallback(async () => {
    if (!placeId) return;
    try {
      const [nameList, parentList] = await Promise.all([
        client.places.listNames(Number(placeId)),
        client.places.listParents(Number(placeId)),
      ]);
      setNames(nameList ?? []);
      setParents(parentList ?? []);
    } catch (loadError) {
      setError(loadError.message);
    }
  }, [client, placeId]);

  useEffect(() => {
    setNames(null);
    setResolved(null);
    load();
  }, [load]);

  const run = async (action) => {
    setError(null);
    try {
      await action();
      await load();
      return true;
    } catch (actionError) {
      setError(actionError.message);
      return false;
    }
  };

  const addName = async (event) => {
    event.preventDefault();
    if (!nameForm.name.trim()) return;
    const ok = await run(() =>
      client.places.addName(Number(placeId), {
        name: nameForm.name.trim(),
        ...(nameForm.language.trim() ? { language: nameForm.language.trim() } : {}),
        validFromYear: toYear(nameForm.from),
        validToYear: toYear(nameForm.to),
      }),
    );
    if (ok) setNameForm({ name: '', language: '', from: '', to: '' });
  };

  const addParent = async (event) => {
    event.preventDefault();
    if (!parentForm.parentPlaceId) return;
    const ok = await run(() =>
      client.places.addParent(Number(placeId), {
        parentPlaceId: Number(parentForm.parentPlaceId),
        validFromYear: toYear(parentForm.from),
        validToYear: toYear(parentForm.to),
      }),
    );
    if (ok) setParentForm({ parentPlaceId: '', from: '', to: '' });
  };

  const resolve = async (event) => {
    event.preventDefault();
    if (year.trim() === '') return;
    try {
      setResolved(await client.places.resolve(Number(placeId), Number(year)));
    } catch (resolveError) {
      setError(resolveError.message);
    }
  };

  return (
    <section className="place-history" aria-labelledby="place-history-title">
      <h3 id="place-history-title">{t('placeHistory.heading', 'Histoire d’un lieu')}</h3>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open
          ? t('placeHistory.hide', 'Masquer l’éditeur')
          : t('placeHistory.show', 'Éditer les noms et rattachements')}
      </Button>
      {error ? <ErrorNotice message={error} /> : null}
      {open ? (
        <label>
          <span>{t('placeHistory.place', 'Lieu')}</span>
          <select value={placeId} onChange={(event) => setPlaceId(event.target.value)}>
            <option value="">{t('placeHistory.choose', '— Choisir un lieu —')}</option>
            {places.map((place) => (
              <option key={place.id} value={place.id}>
                {place.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {open && placeId ? (
        <>
          <h4>{t('placeHistory.names', 'Noms successifs')}</h4>
          {names === null ? (
            <p role="status">{t('placeHistory.loading', 'Chargement…')}</p>
          ) : names.length === 0 ? (
            <p className="notice">{t('placeHistory.noNames', 'Aucun nom historique.')}</p>
          ) : (
            <ul className="search-results">
              {names.map((item) => (
                <li key={item.id}>
                  {item.name}
                  {item.language ? ` [${item.language}]` : ''}
                  {period(item)}{' '}
                  <Button
                    type="button"
                    size="sm"
                    variant="danger"
                    aria-label={t(
                      'placeHistory.removeNameLabel',
                      { name: item.name },
                      'Retirer le nom {name}',
                    )}
                    onClick={() => run(() => client.places.removeName(Number(placeId), item.id))}
                  >
                    {t('placeHistory.remove', 'Retirer')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <form className="create-person-form" onSubmit={addName}>
            <label>
              <span>{t('placeHistory.name', 'Nom')}</span>
              <input
                value={nameForm.name}
                onChange={(event) => setNameForm({ ...nameForm, name: event.target.value })}
              />
            </label>
            <label>
              <span>{t('placeHistory.language', 'Langue (ex. fr)')}</span>
              <input
                value={nameForm.language}
                onChange={(event) => setNameForm({ ...nameForm, language: event.target.value })}
              />
            </label>
            <label>
              <span>{t('placeHistory.from', 'Valable depuis (année)')}</span>
              <input
                type="number"
                value={nameForm.from}
                onChange={(event) => setNameForm({ ...nameForm, from: event.target.value })}
              />
            </label>
            <label>
              <span>{t('placeHistory.to', 'Jusqu’à (année)')}</span>
              <input
                type="number"
                value={nameForm.to}
                onChange={(event) => setNameForm({ ...nameForm, to: event.target.value })}
              />
            </label>
            <Button type="submit" size="sm" disabled={!nameForm.name.trim()}>
              {t('placeHistory.addName', 'Ajouter le nom')}
            </Button>
          </form>

          <h4>{t('placeHistory.parents', 'Rattachements')}</h4>
          {parents.length === 0 ? (
            <p className="notice">{t('placeHistory.noParents', 'Aucun rattachement.')}</p>
          ) : (
            <ul className="search-results">
              {parents.map((item) => (
                <li key={item.id}>
                  {item.parentName}
                  {period(item)}{' '}
                  <Button
                    type="button"
                    size="sm"
                    variant="danger"
                    aria-label={t(
                      'placeHistory.removeParentLabel',
                      { name: item.parentName },
                      'Retirer le rattachement à {name}',
                    )}
                    onClick={() => run(() => client.places.removeParent(Number(placeId), item.id))}
                  >
                    {t('placeHistory.remove', 'Retirer')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <form className="create-person-form" onSubmit={addParent}>
            <label>
              <span>{t('placeHistory.parent', 'Lieu parent')}</span>
              <select
                value={parentForm.parentPlaceId}
                onChange={(event) =>
                  setParentForm({ ...parentForm, parentPlaceId: event.target.value })
                }
              >
                <option value="">{t('placeHistory.choose', '— Choisir un lieu —')}</option>
                {places
                  .filter((place) => String(place.id) !== placeId)
                  .map((place) => (
                    <option key={place.id} value={place.id}>
                      {place.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              <span>{t('placeHistory.from', 'Valable depuis (année)')}</span>
              <input
                type="number"
                value={parentForm.from}
                onChange={(event) => setParentForm({ ...parentForm, from: event.target.value })}
              />
            </label>
            <label>
              <span>{t('placeHistory.to', 'Jusqu’à (année)')}</span>
              <input
                type="number"
                value={parentForm.to}
                onChange={(event) => setParentForm({ ...parentForm, to: event.target.value })}
              />
            </label>
            <Button type="submit" size="sm" disabled={!parentForm.parentPlaceId}>
              {t('placeHistory.addParent', 'Ajouter le rattachement')}
            </Button>
          </form>

          <form className="create-person-form" onSubmit={resolve}>
            <label>
              <span>{t('placeHistory.year', 'Année à consulter')}</span>
              <input type="number" value={year} onChange={(event) => setYear(event.target.value)} />
            </label>
            <Button type="submit" size="sm" variant="secondary" disabled={year.trim() === ''}>
              {t('placeHistory.resolve', 'Voir le lieu à cette date')}
            </Button>
          </form>
          {resolved ? (
            <p role="status" className="data-id">
              {resolved.fullName}
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
