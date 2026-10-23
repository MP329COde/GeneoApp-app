import { useMemo } from 'react';
import { useI18n } from '../design-system/index.js';

/**
 * Libellés des types d'événement, traduits.
 *
 * Les clés correspondent aux types stockés en base (`events.type`). Un type
 * inconnu retombe sur son code brut : le libellé affiché reste la donnée
 * d'origine, jamais une chaîne vide.
 */
const EVENT_LABEL_KEYS = {
  BIRTH: 'eventLabels.birth',
  BAPTISM: 'eventLabels.baptism',
  DEATH: 'eventLabels.death',
  BURIAL: 'eventLabels.burial',
  MARRIAGE: 'eventLabels.marriage',
  DIVORCE: 'eventLabels.divorce',
  ADOPTION: 'eventLabels.adoption',
  OCCUPATION: 'eventLabels.occupation',
  RESIDENCE: 'eventLabels.residence',
  EMIGRATION: 'eventLabels.emigration',
  IMMIGRATION: 'eventLabels.immigration',
  MIGRATION: 'eventLabels.migration',
  CENSUS: 'eventLabels.census',
  MILITARY: 'eventLabels.military',
  GRADUATION: 'eventLabels.graduation',
  WILL: 'eventLabels.will',
  PROBATE: 'eventLabels.probate',
  SUCCESSION: 'eventLabels.succession',
  RELIGIOUS_EVENT: 'eventLabels.religiousEvent',
  RELIGIOUS_COMMITMENT: 'eventLabels.religiousCommitment',
  NATURALIZATION: 'eventLabels.naturalization',
  OTHER: 'eventLabels.other',
};

const EVENT_TYPES = Object.keys(EVENT_LABEL_KEYS);

/**
 * Objet `type -> libellé traduit`, à itérer pour remplir une liste de
 * choix. Recalculé uniquement quand la locale change.
 */
export function useEventLabels() {
  const { t, locale } = useI18n();
  return useMemo(
    () => Object.fromEntries(EVENT_TYPES.map((type) => [type, t(EVENT_LABEL_KEYS[type], type)])),
    [t, locale],
  );
}

/** Libellé traduit d'un type d'événement, pour un usage ponctuel. */
export function useEventLabel() {
  const { t } = useI18n();
  return (type) => t(EVENT_LABEL_KEYS[type] ?? 'eventLabels.other', type);
}

export { EVENT_LABEL_KEYS, EVENT_TYPES };
