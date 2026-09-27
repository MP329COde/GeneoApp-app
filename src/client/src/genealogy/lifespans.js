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

// Associe à une date parsée le nom du lieu de l'événement dont elle provient,
// pour permettre d'afficher « ° 1850 (Rouen) » et distinguer les homonymes.
function earliestWithPlace(entries) {
  const valid = (entries ?? []).filter(({ parsed }) => parsed.valid);
  valid.sort((a, b) => compareGenealogyDates(a.parsed, b.parsed));
  return valid[0] ?? null;
}

/**
 * Années de vie par personne depuis les événements (naissance, sinon
 * baptême ; décès, sinon inhumation) : `{ birth, death, label, birthYear,
 * deathYear, birthPlace }`. `birthPlace` sert à distinguer deux personnes
 * homonymes dans les listes.
 */
export function buildLifespans(events) {
  const collected = new Map();
  for (const event of events ?? []) {
    if (!event?.date_text) continue;
    for (const participant of event.participants ?? []) {
      if (participant.role !== 'PRINCIPAL') continue;
      const entry = collected.get(participant.personId) ?? {};
      (entry[event.type] ??= []).push({
        parsed: parseGenealogyDate(event.date_text),
        place: event.place_name ?? null,
      });
      collected.set(participant.personId, entry);
    }
  }
  const lifespans = new Map();
  for (const [personId, byType] of collected) {
    const birthEntry = earliestWithPlace(byType.BIRTH) ?? earliestWithPlace(byType.BAPTISM);
    const deathEntry = earliestWithPlace(byType.DEATH) ?? earliestWithPlace(byType.BURIAL);
    const birth = birthEntry?.parsed ?? null;
    const death = deathEntry?.parsed ?? null;
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
      birthPlace: birthEntry?.place ?? null,
    });
  }
  return lifespans;
}
