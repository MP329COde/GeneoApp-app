import { yearOf } from '../dates/genealogy-date.js';

/**
 * Seuil (en années) au-delà duquel une personne née/baptisée est présumée
 * décédée en l'absence d'acte de décès explicite — évite les fiches
 * « vivantes » par défaut pour des personnes nées au XVIIe siècle.
 */
export const PRESUMED_DECEASED_AGE_YEARS = 110;

const DEATH_TYPES = new Set(['DEATH', 'BURIAL']);
const BIRTH_TYPES = new Set(['BIRTH', 'BAPTISM']);

/**
 * Détermine si une personne doit être considérée comme non-vivante,
 * d'après ses propres événements (décès/inhumation enregistrés, ou
 * naissance/baptême de plus de `PRESUMED_DECEASED_AGE_YEARS` ans).
 *
 * `events` : liste d'objets `{ type, dateText }` (ou `date_text`) pour les
 * événements dont la personne est le sujet principal.
 */
export function shouldBeDeceased(events, { now = new Date() } = {}) {
  const list = events ?? [];
  const hasDeathRecord = list.some((event) => DEATH_TYPES.has(event.type));
  if (hasDeathRecord) return true;

  const currentYear = now.getFullYear();
  return list.some((event) => {
    if (!BIRTH_TYPES.has(event.type)) return false;
    const year = yearOf(event.dateText ?? event.date_text ?? '');
    return year !== null && currentYear - year > PRESUMED_DECEASED_AGE_YEARS;
  });
}
