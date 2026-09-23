import {
  compareGenealogyDates,
  parseGenealogyDate,
  yearOf,
} from '../../../db/src/dates/genealogy-date.js';

// Année courte d'une date, avec son approximation (« vers 1760 », « av. 1790 »).
export function shortYear(parsed) {
  if (!parsed?.valid) return null;
  const year = yearOf(parsed);
  const prefix =
    { ABOUT: 'vers ', ESTIMATED: 'vers ', BEFORE: 'av. ', AFTER: 'ap. ' }[parsed.kind] ?? '';
  const range = parsed.kind === 'BETWEEN' ? `${parsed.start.year}/${parsed.end.year}` : null;
  return `${prefix}${range ?? year}${parsed.uncertain ? ' ?' : ''}`;
}

function earliest(dates) {
  return dates.filter((parsed) => parsed.valid).sort(compareGenealogyDates)[0] ?? null;
}

/**
 * Années de vie par personne depuis les événements (naissance, sinon
 * baptême ; décès, sinon inhumation) : `{ birth, death, label, birthYear }`.
 */
export function buildLifespans(events) {
  const collected = new Map();
  for (const event of events ?? []) {
    if (!event?.date_text) continue;
    for (const participant of event.participants ?? []) {
      if (participant.role !== 'PRINCIPAL') continue;
      const entry = collected.get(participant.personId) ?? {};
      (entry[event.type] ??= []).push(parseGenealogyDate(event.date_text));
      collected.set(participant.personId, entry);
    }
  }
  const lifespans = new Map();
  for (const [personId, byType] of collected) {
    const birth = earliest(byType.BIRTH ?? []) ?? earliest(byType.BAPTISM ?? []);
    const death = earliest(byType.DEATH ?? []) ?? earliest(byType.BURIAL ?? []);
    if (!birth && !death) continue;
    const label =
      birth && death
        ? `${shortYear(birth)} – ${shortYear(death)}`
        : birth
          ? `° ${shortYear(birth)}`
          : `† ${shortYear(death)}`;
    lifespans.set(personId, {
      birth,
      death,
      label,
      birthYear: birth ? yearOf(birth) : null,
      deathYear: death ? yearOf(death) : null,
    });
  }
  return lifespans;
}
