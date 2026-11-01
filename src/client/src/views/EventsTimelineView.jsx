import { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Button,
  EmptyState,
  SkeletonGroup,
  useTranslation,
} from '../design-system/index.js';
import { client } from '../api/app-client.js';
import { EventEditForm } from './EventEditForm.jsx';
import { LifelineChart } from './LifelineChart.jsx';
import { ErrorNotice, Icon, personLabel } from '../components/shared.jsx';
import '../styles/events-notebook-refonte.css';
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
      <div className="search-panel evnb">
        <EmptyState icon={<Icon name="event" />} title={t('evnb.events.selectTitle')}>
          {t(
            'eventsTimeline.selectPerson',
            'Sélectionnez une personne pour voir et ajouter des événements.',
          )}
        </EmptyState>
      </div>
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
    <div className="search-panel evnb">
      <header className="evnb-head">
        <p className="evnb-eyebrow">{t('evnb.eyebrow.events')}</p>
        <h3>
          {t('eventsTimeline.title', { name: personLabel(selected) }, 'Événements de {name}')}
        </h3>
        <p className="evnb-intro">{t('evnb.events.intro')}</p>
      </header>
      {eventsError ? <ErrorNotice message={eventsError} /> : null}

      <form className="evnb-form evnb-card" onSubmit={handleSubmit}>
        <h4 className="evnb-card__title evnb-form__wide">{t('evnb.events.addTitle')}</h4>
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
        <h5 className="evnb-form__group evnb-form__wide">{t('evnb.events.groupWhen')}</h5>
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
        <small id="event-date-reading" className="date-reading evnb-form__wide" aria-live="polite">
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
        <h5 className="evnb-form__group evnb-form__wide">{t('evnb.events.groupWhere')}</h5>
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
        <div className="evnb-form__actions evnb-form__wide">
          <Button type="submit" size="sm" disabled={busy}>
            {t('eventsTimeline.submit', 'Ajouter l’événement')}
          </Button>
        </div>
      </form>

      <h4 className="evnb-section-title">{t('evnb.events.listTitle')}</h4>
      {events === null ? (
        <SkeletonGroup label={t('evnb.events.loadingLabel')} rows={3} />
      ) : events.length === 0 ? (
        <EmptyState icon={<Icon name="event" />} title={t('evnb.events.emptyTitle')}>
          {t('evnb.events.emptyBody')}
        </EmptyState>
      ) : (
        <ul className="evnb-events">
          {events.map((item) => (
            <li key={item.id} className="evnb-event">
              <div className="evnb-event__main">
                <Badge tone="neutral">{item.type}</Badge>
                {item.value ? <strong className="evnb-event__value">{item.value}</strong> : null}
                <span className="evnb-event__date">
                  {item.date_text ?? t('eventsTimeline.unknownDate', '(date inconnue)')}
                </span>
                {item.place_id ? (
                  <span className="evnb-event__place">— {placeLabelById(item.place_id)}</span>
                ) : null}
              </div>
              <div className="evnb-event__actions">
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
              </div>
              {editingId === item.id ? (
                <div className="evnb-event__edit">
                  <EventEditForm
                    event={item}
                    places={places}
                    precisions={DATE_PRECISIONS}
                    precisionKeys={DATE_PRECISION_KEYS}
                    busy={busy}
                    onSave={(data) => handleSave(item.id, data)}
                    onCancel={() => setEditingId(null)}
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TimelinePanel({ onNavigate, persons = [], selectedId = null, onSelect }) {
  const { t } = useTranslation();
  const [events, setEvents] = useState(null);
  const [timelineError, setTimelineError] = useState(null);
  const [mode, setMode] = useState('list');

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

  const head = (
    <header className="evnb-head">
      <p className="evnb-eyebrow">{t('evnb.eyebrow.timeline')}</p>
      <h3>{t('nav.timeline', 'Chronologie')}</h3>
      <p className="evnb-intro">{t('evnb.timeline.intro')}</p>
    </header>
  );

  if (timelineError) {
    return (
      <div className="evnb">
        {head}
        <ErrorNotice message={timelineError} />
      </div>
    );
  }

  if (events === null) {
    return (
      <div className="evnb">
        {head}
        <SkeletonGroup label={t('evnb.timeline.loadingLabel')} rows={4} />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="evnb">
        {head}
        <EmptyState icon={<Icon name="timeline" />} title={t('evnb.timeline.emptyTitle')}>
          {t('evnb.timeline.emptyBody')}
        </EmptyState>
      </div>
    );
  }

  const toggle = (
    <div
      className="timeline-toggle evnb-toolbar"
      role="group"
      aria-label={t('eventsTimeline.mode.label', 'Affichage de la chronologie')}
    >
      <Button
        type="button"
        size="sm"
        variant={mode === 'list' ? 'primary' : 'secondary'}
        aria-pressed={mode === 'list'}
        onClick={() => setMode('list')}
      >
        {t('eventsTimeline.mode.list', 'Liste')}
      </Button>
      <Button
        type="button"
        size="sm"
        variant={mode === 'chart' ? 'primary' : 'secondary'}
        aria-pressed={mode === 'chart'}
        onClick={() => setMode('chart')}
      >
        {t('eventsTimeline.mode.chart', 'Frise')}
      </Button>
    </div>
  );

  if (mode === 'chart') {
    return (
      <div className="evnb">
        {head}
        {toggle}
        <LifelineChart
          persons={persons}
          events={events}
          selectedId={selectedId}
          onSelect={onSelect ?? onNavigate}
        />
      </div>
    );
  }

  return (
    <div className="evnb">
      {head}
      {toggle}
      <p className="evnb-count">{t('evnb.timeline.count', { count: events.length })}</p>
      <ol className="evnb-events evnb-events--rail">
        {events.map((event) => (
          <li key={event.id} className="evnb-event">
            <div className="evnb-event__main">
              <Badge tone="neutral">{event.type}</Badge>
              {event.value ? <strong className="evnb-event__value">{event.value}</strong> : null}
              <span className="evnb-event__date">
                {event.date_text ?? t('eventsTimeline.unknownDate', '(date inconnue)')}
              </span>
              {event.place_name ? (
                <span className="evnb-event__place">— {event.place_name}</span>
              ) : null}
              {event.participants.length > 0 ? (
                <span className="evnb-event__who">
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
            </div>
            {event.participants.length > 0 ? (
              <div className="evnb-event__actions">
                {event.participants.map((participant) => (
                  <Button
                    key={participant.personId}
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => onNavigate(participant.personId)}
                  >
                    {t(
                      'eventsTimeline.view',
                      { name: participant.personGivenNames },
                      'Voir {name}',
                    )}
                  </Button>
                ))}
              </div>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
