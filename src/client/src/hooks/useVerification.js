import { createContext, useEffect, useRef, useState } from 'react';
import { client } from '../api/app-client.js';

export function pluralFr(count, forms) {
  const category = new Intl.PluralRules('fr').select(count);
  return forms[category] ?? forms.other;
}

export function countedFr(count, forms) {
  return `${new Intl.NumberFormat('fr').format(count)} ${pluralFr(count, forms)}`;
}

export const TIMELINE_ISSUE_LABELS = {
  BIRTH_AFTER_DEATH: 'Naissance enregistrée après le décès',
  MARRIAGE_AFTER_DEATH: 'Mariage enregistré après le décès',
  MARRIAGE_BEFORE_BIRTH: 'Mariage enregistré avant la naissance',
  MARRIAGE_VERY_YOUNG: 'Mariage à un âge très jeune',
  BAPTISM_BEFORE_BIRTH: 'Baptême enregistré avant la naissance',
  BURIAL_BEFORE_DEATH: 'Inhumation enregistrée avant le décès',
  IMPOSSIBLE_AGE: 'Âge au décès exceptionnel',
  MULTIPLE_BIRTHS: 'Plusieurs naissances enregistrées',
  CHILD_BORN_BEFORE_PARENT: 'Enfant né avant son parent',
  PARENT_TOO_YOUNG: 'Parent très jeune à la naissance',
  PARENT_TOO_OLD: 'Parent âgé à la naissance',
  CHILD_AFTER_PARENT_DEATH: "Naissance de l'enfant enregistrée après le décès du parent",
  LIVING_WITH_DEATH: 'Marquée vivante malgré un décès enregistré',
  LIVING_TOO_OLD: 'Marquée vivante mais très âgée',
};
export const SEVERITY_LABELS = { CERTAIN: 'Erreur certaine', POSSIBLE: 'Inhabituel, à vérifier' };

// Formes plurielles (accord singulier/pluriel réel, pas de suffixe "(s)")
// pour les messages qui préfixent ce libellé par un nombre, ex.
// « 1 375 enfants nés avant leur parent ». Intl.PluralRules('fr') classe
// 0 et 1 dans « one » (accord français correct : « 0 naissance », pas
// « 0 naissances »).
export const TIMELINE_ISSUE_LABELS_PLURAL = {
  BIRTH_AFTER_DEATH: {
    one: 'naissance enregistrée après le décès',
    other: 'naissances enregistrées après le décès',
  },
  MARRIAGE_AFTER_DEATH: {
    one: 'mariage enregistré après le décès',
    other: 'mariages enregistrés après le décès',
  },
  MARRIAGE_BEFORE_BIRTH: {
    one: 'mariage enregistré avant la naissance',
    other: 'mariages enregistrés avant la naissance',
  },
  MARRIAGE_VERY_YOUNG: {
    one: 'mariage à un âge très jeune',
    other: 'mariages à un âge très jeune',
  },
  BAPTISM_BEFORE_BIRTH: {
    one: 'baptême enregistré avant la naissance',
    other: 'baptêmes enregistrés avant la naissance',
  },
  BURIAL_BEFORE_DEATH: {
    one: 'inhumation enregistrée avant le décès',
    other: 'inhumations enregistrées avant le décès',
  },
  IMPOSSIBLE_AGE: { one: 'âge au décès exceptionnel', other: 'âges au décès exceptionnels' },
  MULTIPLE_BIRTHS: {
    one: 'naissance multiple enregistrée',
    other: 'naissances multiples enregistrées',
  },
  CHILD_BORN_BEFORE_PARENT: {
    one: 'enfant né avant son parent',
    other: 'enfants nés avant leur parent',
  },
  PARENT_TOO_YOUNG: {
    one: 'parent très jeune à la naissance',
    other: 'parents très jeunes à la naissance',
  },
  PARENT_TOO_OLD: { one: 'parent âgé à la naissance', other: 'parents âgés à la naissance' },
  CHILD_AFTER_PARENT_DEATH: {
    one: "naissance de l'enfant enregistrée après le décès du parent",
    other: "naissances d'enfants enregistrées après le décès du parent",
  },
  LIVING_WITH_DEATH: {
    one: 'personne marquée vivante malgré un décès enregistré',
    other: 'personnes marquées vivantes malgré un décès enregistré',
  },
  LIVING_TOO_OLD: {
    one: 'personne marquée vivante mais très âgée',
    other: 'personnes marquées vivantes mais très âgées',
  },
};
export const GENERIC_TIMELINE_ISSUE_PLURAL = {
  one: 'incohérence de chronologie',
  other: 'incohérences de chronologie',
};

// ---------- Vérification intégrée ----------
// Les contrôles (doublons, cycles, chronologie) tournent en arrière-plan après
// chaque modification. Les résultats sont portés par la personne concernée
// (pastille dans l'arbre, section « À vérifier » du panneau) et chaque
// nouvelle alerte est publiée une seule fois dans le centre de notifications.
export const VerificationContext = createContext(new Map());

function addIssue(map, personId, issue) {
  if (personId === null || personId === undefined) return;
  if (!map.has(personId)) map.set(personId, []);
  map.get(personId).push(issue);
}

export function buildVerificationIssues({ duplicates = [], cycles = [], timeline = [] }) {
  const byPerson = new Map();
  for (const pair of duplicates) {
    const [left, right] = pair.persons;
    const key = `duplicate:${Math.min(left.id, right.id)}:${Math.max(left.id, right.id)}`;
    addIssue(byPerson, left.id, { key, kind: 'duplicate', score: pair.score, other: right });
    addIssue(byPerson, right.id, { key, kind: 'duplicate', score: pair.score, other: left });
  }
  for (const cycle of cycles) {
    const key = `cycle:${[...cycle].sort((a, b) => a - b).join('-')}`;
    for (const id of new Set(cycle)) addIssue(byPerson, id, { key, kind: 'cycle', cycle });
  }
  for (const issue of timeline) {
    const personId = issue.personId ?? issue.childId;
    const key = `timeline:${issue.code}:${personId}:${issue.parentId ?? ''}`;
    addIssue(byPerson, personId, { key, kind: 'timeline', ...issue });
  }
  return byPerson;
}

// Regroupe les incohérences par type (et non une notification par occurrence
// individuelle) : un import massif (ex. GEDCOM de 5000 personnes) peut
// produire des milliers d'alertes de chronologie identiques, et créer une
// notification par occurrence noierait le centre de notifications (voir
// contre-audit, point 4). La clé de déduplication est stable par groupe (pas
// par occurrence), donc une analyse suivante qui retrouve les mêmes
// incohérences ne republie rien (INSERT OR IGNORE sur dedupe_key en base).
export function verificationNotifications(byPerson) {
  const groups = new Map();
  const addToGroup = (groupKey, factory) => {
    if (!groups.has(groupKey)) {
      groups.set(groupKey, { count: 0, factory });
    }
    groups.get(groupKey).count += 1;
  };

  const seenIssueKeys = new Set();
  for (const issues of byPerson.values()) {
    for (const issue of issues) {
      if (seenIssueKeys.has(issue.key)) continue;
      seenIssueKeys.add(issue.key);
      if (issue.kind === 'duplicate') {
        addToGroup('duplicate', (count) => ({
          type: 'warning',
          title: 'Doublons possibles',
          message: `${countedFr(count, { one: 'doublon possible détecté', other: 'doublons possibles détectés' })} — ouvrir la vérification.`,
        }));
      } else if (issue.kind === 'cycle') {
        addToGroup('cycle', (count) => ({
          type: 'danger',
          title: 'Cycles de filiation',
          message: `${countedFr(count, { one: 'cycle de filiation détecté', other: 'cycles de filiation détectés' })} — ouvrir la cohérence.`,
        }));
      } else {
        addToGroup(`timeline:${issue.code}`, (count) => ({
          type: issue.severity === 'CERTAIN' ? 'danger' : 'warning',
          title: TIMELINE_ISSUE_LABELS[issue.code] ?? 'Incohérence de chronologie',
          message: `${countedFr(count, TIMELINE_ISSUE_LABELS_PLURAL[issue.code] ?? GENERIC_TIMELINE_ISSUE_PLURAL)} — ouvrir la cohérence.`,
        }));
      }
    }
  }

  return [...groups.entries()].map(([groupKey, { count, factory }]) => ({
    ...factory(count),
    dedupeKey: `verification-group:${groupKey}`,
  }));
}

// Analyse doublons/cycles/chronologie : coûteuse sur une grande base (elle
// parcourt toute la base et bloque le process pendant l'exécution des
// requêtes synchrones better-sqlite3), elle ne doit donc PAS être relancée
// après chaque écriture individuelle. Elle ne se déclenche qu'au démarrage
// (quand `persons` devient disponible), après un import, ou à la demande
// (bouton « Relancer la vérification »), chacune de ces occasions faisant
// avancer `runToken`. Un anti-rebond généreux absorbe malgré tout une rafale
// d'appels rapprochés (ex. plusieurs incréments de `runToken` coup sur coup).
const VERIFICATION_DEBOUNCE_MS = 1500;

export function useVerification({ persons, runToken, personLabelById }) {
  const [issues, setIssues] = useState(() => new Map());
  const [running, setRunning] = useState(false);
  const labelRef = useRef(personLabelById);
  labelRef.current = personLabelById;

  useEffect(() => {
    if (!persons?.length) {
      setIssues(new Map());
      return undefined;
    }
    let cancelled = false;
    setRunning(true);
    const timer = setTimeout(async () => {
      const safe = (promise) => Promise.resolve(promise).catch(() => []);
      const [duplicatesResult, cycles, timeline] = await Promise.all([
        safe(client.search.duplicates()),
        safe(client.graph.cycles()),
        safe(client.graph.timeline()),
      ]);
      if (cancelled) return;
      const duplicates = Array.isArray(duplicatesResult)
        ? duplicatesResult
        : (duplicatesResult?.items ?? []);
      const byPerson = buildVerificationIssues({
        duplicates,
        cycles: cycles ?? [],
        timeline: timeline ?? [],
      });
      setIssues(byPerson);
      setRunning(false);
      const items = verificationNotifications(byPerson);
      if (items.length && client.notifications?.publish) {
        try {
          const result = await client.notifications.publish(items);
          if (result?.created) window.dispatchEvent(new Event('geneoapp:notifications'));
        } catch {
          // les alertes restent visibles dans les fiches même sans notification
        }
      }
    }, VERIFICATION_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // Dépendances volontairement réduites : ne pas relancer l'analyse sur
    // chaque changement de contenu de `persons` (chaque écriture), seulement
    // à l'apparition de la liste et quand `runToken` avance explicitement.
  }, [Boolean(persons?.length), runToken]);

  return { issues, running };
}
