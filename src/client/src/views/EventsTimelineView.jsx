import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, useTranslation } from '../design-system/index.js';
import { client } from '../api/app-client.js';
import { EventEditForm } from './EventEditForm.jsx';
import { ErrorNotice, personLabel } from '../components/shared.jsx';
import {
  formatGenealogyDate,
  parseGenealogyDate,
  precisionOf,
} from '../../../db/src/dates/genealogy-date.js';

const EVENT_TYPES = [
  'BIRTH',
  'DEATH',
  'MARRIAGE',
  'DIVORCE',
  'BAPTISM',
  'BURIAL',
  'ADOPTION',
  'OCCUPATION',
  'RESIDENCE',
  'EMIGRATION',
  'IMMIGRATION',
  'MIGRATION',
  'CENSUS',
  'MILITARY',
  'GRADUATION',
  'WILL',
  'PROBATE',
  'SUCCESSION',
  'RELIGIOUS_EVENT',
  'RELIGIOUS_COMMITMENT',
  'NATURALIZATION',
  'OTHER',
];
const DATE_PRECISIONS = [
  'EXACT',
  'ABOUT',
  'ESTIMATED',
  'CALCULATED',
  'BEFORE',
  'AFTER',
  'BETWEEN',
  'UNKNOWN',
];

/** Clé de traduction de la précision de date, par code enregistré en base. */
const DATE_PRECISION_KEYS = {
  EXACT: 'eventsTimeline.precision.exact',
  ABOUT: 'eventsTimeline.precision.about',
  ESTIMATED: 'eventsTimeline.precision.estimated',
  CALCULATED: 'eventsTimeline.precision.calculated',
  BEFORE: 'eventsTimeline.precision.before',
  AFTER: 'eventsTimeline.precision.after',
  BETWEEN: 'eventsTimeline.precision.between',
  UNKNOWN: 'eventsTimeline.precision.unknown',
};

export function EventsPanel({ selected }) {
  const { t } = useTranslation();
  const [events, setEvents] = useState(null);
  const [places, setPlaces] = useState([]);
  const [type, setType] = useState('BIRTH');
  const [value, setValue] = useState('');
  const [dateText, setDateText] = useState('');
  const [datePrecision, setDatePrecision] = useState('EXACT');
  const [placeId, setPlaceId] = useState('');
  const [newPlaceName, setNewPlaceName] = useState('');
  const [newPlaceLatitude, setNewPlaceLatitude] = useState('');
  const [newPlaceLongitude, setNewPlaceLongitude] = useState('');
  const [eventsError, setEventsError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const loadEvents = useCallback(async () => {
    if (!selected) return;
    try {
      setEvents(await client.events.listForPerson(selected.id));
    } catch (loadError) {
      setEventsError(loadError.message);
    }
  }, [selected]);

  useEffect(() => {
    setEvents(null);
    loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    client.places
      .list()
      .then(setPlaces)
      .catch((loadError) => setEventsError(loadError.message));
  }, []);

  const placeLabelById = (id) =>
    places.find((place) => place.id === id)?.name ??
    t('eventsTimeline.placeFallback', { id }, 'Lieu #{id}');

  if (!selected) {
    return (
      <p className="notice">
        {t(
          'eventsTimeline.selectPerson',
          'Sélectionnez une personne pour voir et ajouter des événements.',
        )}
      </p>
    );
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setEventsError(null);
    try {
      let resolvedPlaceId = placeId ? Number(placeId) : null;
      if (newPlaceName.trim()) {
        const place = await client.places.create({
          name: newPlaceName.trim(),
          latitude: newPlaceLatitude.trim() ? Number(newPlaceLatitude) : undefined,
          longitude: newPlaceLongitude.trim() ? Number(newPlaceLongitude) : undefined,
        });
        resolvedPlaceId = place.id;
        setPlaces((current) => [...current, place]);
      }
      await client.events.create({
        type,
        value: value.trim() || null,
        dateText: dateText.trim() || null,
        datePrecision,
        placeId: resolvedPlaceId,
        participants: [{ personId: selected.id, role: 'PRINCIPAL' }],
      });
      setValue('');
      setDateText('');
      setNewPlaceName('');
      setNewPlaceLatitude('');
      setNewPlaceLongitude('');
      setPlaceId('');
      await loadEvents();
    } catch (createError) {
      setEventsError(createError.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async (id, data) => {
    setBusy(true);
    setEventsError(null);
    try {
      await client.events.update(id, data);
      setEditingId(null);
      await loadEvents();
    } catch (saveError) {
      setEventsError(saveError.message);
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (id) => {
    setBusy(true);
    setEventsError(null);
    try {
      await client.events.remove(id);
      await loadEvents();
    } catch (removeError) {
      setEventsError(removeError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="search-panel">
      <h3>{t('eventsTimeline.title', { name: personLabel(selected) }, 'Événements de {name}')}</h3>
      {eventsError ? <ErrorNotice message={eventsError} /> : null}

      <form className="create-person-form" onSubmit={handleSubmit}>
        <label>
          <span>{t('eventsTimeline.field.type', 'Type')}</span>
          <select value={type} onChange={(event) => setType(event.target.value)}>
            {EVENT_TYPES.map((eventType) => (
              <option key={eventType} value={eventType}>
                {eventType}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>
            {t(
              'eventsTimeline.field.value',
              'Valeur (optionnel — ex. profession, mention de diplôme, confession…)',
            )}
          </span>
          <input value={value} onChange={(event) => setValue(event.target.value)} />
        </label>
        <label>
          <span>{t('eventsTimeline.field.date', 'Date (texte libre)')}</span>
          <input
            value={dateText}
            aria-describedby="event-date-reading"
            onChange={(event) => {
              setDateText(event.target.value);
              // La précision suit la saisie (« vers 1812 » → ABOUT) ; elle reste modifiable.
              if (event.target.value.trim()) setDatePrecision(precisionOf(event.target.value));
            }}
          />
        </label>
        <small id="event-date-reading" className="date-reading" aria-live="polite">
          {dateText.trim()
            ? parseGenealogyDate(dateText).valid
              ? t(
                  'eventsTimeline.date.readAs',
                  { date: formatGenealogyDate(dateText) },
                  'Lu comme : {date}',
                )
              : t(
                  'eventsTimeline.date.unrecognized',
                  'Date non reconnue : elle sera conservée telle quelle.',
                )
            : t(
                'eventsTimeline.date.examples',
                'Ex. : 25 avril 1998, avril 1998, vers 1998, avant 1998, entre 1995 et 1998, 1998 ?',
              )}
        </small>
        <label>
          <span>{t('eventsTimeline.field.precision', 'Précision de date')}</span>
          <select value={datePrecision} onChange={(event) => setDatePrecision(event.target.value)}>
            {DATE_PRECISIONS.map((precision) => (
              <option key={precision} value={precision}>
                {t(DATE_PRECISION_KEYS[precision] ?? 'eventsTimeline.precision.unknown', precision)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t('eventsTimeline.field.existingPlace', 'Lieu existant (optionnel)')}</span>
          <select value={placeId} onChange={(event) => setPlaceId(event.target.value)}>
            <option value="">{t('eventsTimeline.noPlace', '— Aucun —')}</option>
            {places.map((place) => (
              <option key={place.id} value={place.id}>
                {place.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t('eventsTimeline.field.newPlace', 'Ou nouveau lieu (optionnel)')}</span>
          <input value={newPlaceName} onChange={(event) => setNewPlaceName(event.target.value)} />
        </label>
        <label>
          <span>{t('eventsTimeline.field.latitude', 'Latitude (optionnel)')}</span>
          <input
            value={newPlaceLatitude}
            onChange={(event) => setNewPlaceLatitude(event.target.value)}
            inputMode="decimal"
          />
        </label>
        <label>
          <span>{t('eventsTimeline.field.longitude', 'Longitude (optionnel)')}</span>
          <input
            value={newPlaceLongitude}
            onChange={(event) => setNewPlaceLongitude(event.target.value)}
            inputMode="decimal"
          />
        </label>
        <Button type="submit" size="sm" disabled={busy}>
          {t('eventsTimeline.submit', 'Ajouter l’événement')}
        </Button>
      </form>

      {events === null ? (
        <p role="status">{t('eventsTimeline.loading', 'Chargement…')}</p>
      ) : events.length === 0 ? (
        <p className="notice">
          {t('eventsTimeline.empty', 'Aucun événement pour cette personne.')}
        </p>
      ) : (
        <ul className="search-results">
          {events.map((item) => (
            <li key={item.id}>
              <Badge tone="neutral">{item.type}</Badge>{' '}
              {item.value ? <strong>{item.value}</strong> : null}{' '}
              {item.date_text ?? t('eventsTimeline.unknownDate', '(date inconnue)')}
              {item.place_id ? ` — ${placeLabelById(item.place_id)}` : ''}
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setEditingId(editingId === item.id ? null : item.id)}
                aria-expanded={editingId === item.id}
                disabled={busy}
              >
                {t('eventsTimeline.edit', 'Modifier')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="danger"
                onClick={() => handleRemove(item.id)}
                disabled={busy}
              >
                {t('eventsTimeline.remove', 'Supprimer')}
              </Button>
              {editingId === item.id ? (
                <EventEditForm
                  event={item}
                  places={places}
                  precisions={DATE_PRECISIONS}
                  precisionKeys={DATE_PRECISION_KEYS}
                  busy={busy}
                  onSave={(data) => handleSave(item.id, data)}
                  onCancel={() => setEditingId(null)}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TimelinePanel({ onNavigate }) {
  const { t } = useTranslation();
  const [events, setEvents] = useState(null);
  const [timelineError, setTimelineError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    client.events
      .listAll()
      .then((list) => {
        if (!cancelled) setEvents(list);
      })
      .catch((loadError) => {
        if (!cancelled) setTimelineError(loadError.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (timelineError) {
    return <ErrorNotice message={timelineError} />;
  }

  if (events === null) {
    return <p role="status">{t('eventsTimeline.loading', 'Chargement…')}</p>;
  }

  if (events.length === 0) {
    return (
      <p className="notice">{t('eventsTimeline.emptyGlobal', 'Aucun événement enregistré.')}</p>
    );
  }

  return (
    <ol className="search-results">
      {events.map((event) => (
        <li key={event.id}>
          <Badge tone="neutral">{event.type}</Badge>{' '}
          {event.value ? <strong>{event.value}</strong> : null}{' '}
          {event.date_text ?? t('eventsTimeline.unknownDate', '(date inconnue)')}
          {event.place_name ? ` — ${event.place_name}` : ''}
          {event.participants.length > 0 ? (
            <span>
              {' '}
              (
              {event.participants
                .map(
                  (participant) =>
                    `${participant.personGivenNames} ${participant.personFamilyName}`,
                )
                .join(', ')}
              )
            </span>
          ) : null}
          {event.participants.map((participant) => (
            <Button
              key={participant.personId}
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => onNavigate(participant.personId)}
            >
              {t('eventsTimeline.view', { name: participant.personGivenNames }, 'Voir {name}')}
            </Button>
          ))}
        </li>
      ))}
    </ol>
  );
}
