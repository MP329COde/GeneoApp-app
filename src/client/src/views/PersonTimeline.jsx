import { useEffect, useState } from 'react';
import {
  compareGenealogyDates,
  formatGenealogyDate,
  parseGenealogyDate,
  yearsBetween,
} from '../../../db/src/dates/genealogy-date.js';

export const EVENT_LABELS = {
  BIRTH: 'Naissance',
  BAPTISM: 'Baptême',
  DEATH: 'Décès',
  BURIAL: 'Inhumation',
  MARRIAGE: 'Mariage',
  DIVORCE: 'Divorce',
  ADOPTION: 'Adoption',
  OTHER: 'Événement',
};

function personName(person) {
  return `${person.given_names} ${person.family_name}`;
}

/**
 * Chronologie d'une personne, enrichie des événements de sa famille proche
 * (naissance de la fratrie et des enfants, décès des parents et conjoints),
 * avec l'âge de la personne à chaque date quand il est calculable.
 */
export function buildPersonTimeline(person, relations, events) {
  const kin = new Map();
  const tag = (list, relation) => list?.forEach((relative) => kin.set(relative.id, relation));
  tag(relations?.parents, 'parent');
  tag(relations?.siblings, 'fratrie');
  tag(relations?.spouses, 'conjoint');
  tag(relations?.children, 'enfant');

  const familyTypes = {
    parent: ['DEATH'],
    fratrie: ['BIRTH', 'DEATH'],
    conjoint: ['DEATH'],
    enfant: ['BIRTH', 'MARRIAGE', 'DEATH'],
  };
  const own = (events ?? []).filter((event) =>
    event.participants?.some((participant) => participant.personId === person.id),
  );
  const birth = own
    .filter((event) => event.type === 'BIRTH' || event.type === 'BAPTISM')
    .map((event) => parseGenealogyDate(event.date_text ?? ''))
    .filter((parsed) => parsed.valid)
    .sort(compareGenealogyDates)[0];

  const rows = [];
  for (const event of events ?? []) {
    const self = event.participants?.some((participant) => participant.personId === person.id);
    const relative = self
      ? null
      : event.participants?.find(
          (participant) =>
            participant.role === 'PRINCIPAL' &&
            familyTypes[kin.get(participant.personId)]?.includes(event.type),
        );
    if (!self && !relative) continue;
    const parsed = parseGenealogyDate(event.date_text ?? '');
    const age =
      birth && parsed.valid && !(self && event.type === 'BIRTH')
        ? yearsBetween(birth, parsed)
        : null;
    rows.push({
      id: event.id,
      type: event.type,
      date: parsed,
      place: event.place_name ?? null,
      self,
      relation: relative ? kin.get(relative.personId) : null,
      relativeName: relative
        ? `${relative.personGivenNames ?? ''} ${relative.personFamilyName ?? ''}`.trim()
        : null,
      age: age && age.typical >= 0 ? Math.floor(age.typical) : null,
      approximateAge: age
        ? age.min !== null && Math.floor(age.min) !== Math.floor(age.max ?? age.min)
        : false,
    });
  }
  return rows.sort((a, b) => compareGenealogyDates(a.date, b.date));
}

export function PersonTimeline({ client, person, relations }) {
  const [events, setEvents] = useState(null);
  const [withFamily, setWithFamily] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    client.events
      .listAll()
      .then((list) => !cancelled && setEvents(list ?? []))
      .catch((loadError) => !cancelled && setError(loadError.message));
    return () => {
      cancelled = true;
    };
  }, [client, person.id]);

  if (error) {
    return (
      <p role="alert" className="notice notice--error">
        {error}
      </p>
    );
  }
  if (!events) {
    return (
      <p role="status" className="loading-line">
        Chargement de la chronologie…
      </p>
    );
  }
  const rows = buildPersonTimeline(person, relations, events).filter(
    (row) => withFamily || row.self,
  );

  return (
    <section className="search-panel person-timeline" aria-labelledby="person-timeline-title">
      <h3 id="person-timeline-title">Chronologie de {personName(person)}</h3>
      <label className="settings-toggle">
        <input
          type="checkbox"
          checked={withFamily}
          onChange={(event) => setWithFamily(event.target.checked)}
        />
        <span>Inclure la famille proche (fratrie, enfants, décès des parents et conjoints)</span>
      </label>
      {rows.length === 0 ? (
        <p className="notice">Aucun événement daté pour cette personne.</p>
      ) : (
        <ol className="life-timeline">
          {rows.map((row) => (
            <li
              key={`${row.id}-${row.relation ?? 'self'}`}
              className={row.self ? 'life-timeline__own' : 'life-timeline__family'}
            >
              <span className="life-timeline__date">
                {row.date.valid ? formatGenealogyDate(row.date) : 'date inconnue'}
              </span>
              <span className="life-timeline__what">
                <strong>{EVENT_LABELS[row.type] ?? row.type}</strong>
                {row.relation ? ` · ${row.relation} : ${row.relativeName}` : ''}
                {row.place ? ` · ${row.place}` : ''}
              </span>
              {row.age !== null ? (
                <span className="life-timeline__age">
                  {row.approximateAge ? 'vers ' : ''}
                  {row.age} an{row.age > 1 ? 's' : ''}
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
