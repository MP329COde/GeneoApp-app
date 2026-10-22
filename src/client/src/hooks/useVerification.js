import { createContext, useEffect, useRef, useState } from 'react';
import { useTranslation } from '../design-system/index.js';
import { client } from '../api/app-client.js';

export function pluralFr(count, forms) {
  const category = new Intl.PluralRules('fr').select(count);
  return forms[category] ?? forms.other;
}

export function countedFr(count, forms) {
  return `${new Intl.NumberFormat('fr').format(count)} ${pluralFr(count, forms)}`;
}

/**
 * Forme « nombre + libellé accordé », traduite.
 *
 * `t` applique les règles de pluriel de la locale et le format de nombre
 * correspondant (« 1 375 » en français, « 1,375 » en anglais).
 */
export function countedT(t, count, key) {
  return t(key, { count });
}

/**
 * Clés i18n des incohérences de chronologie, par code d'issue.
 *
 * Le libellé affiché est traduit par l'appelant : ce module ne connaît pas
 * la locale, il ne fournit que la clé et le code métier.
 */
export const TIMELINE_ISSUE_KEYS = {
  BIRTH_AFTER_DEATH: 'timelineIssue.BIRTH_AFTER_DEATH',
  MARRIAGE_AFTER_DEATH: 'timelineIssue.MARRIAGE_AFTER_DEATH',
  MARRIAGE_BEFORE_BIRTH: 'timelineIssue.MARRIAGE_BEFORE_BIRTH',
  MARRIAGE_VERY_YOUNG: 'timelineIssue.MARRIAGE_VERY_YOUNG',
  BAPTISM_BEFORE_BIRTH: 'timelineIssue.BAPTISM_BEFORE_BIRTH',
  BURIAL_BEFORE_DEATH: 'timelineIssue.BURIAL_BEFORE_DEATH',
  IMPOSSIBLE_AGE: 'timelineIssue.IMPOSSIBLE_AGE',
  MULTIPLE_BIRTHS: 'timelineIssue.MULTIPLE_BIRTHS',
  CHILD_BORN_BEFORE_PARENT: 'timelineIssue.CHILD_BORN_BEFORE_PARENT',
  PARENT_TOO_YOUNG: 'timelineIssue.PARENT_TOO_YOUNG',
  PARENT_TOO_OLD: 'timelineIssue.PARENT_TOO_OLD',
  CHILD_AFTER_PARENT_DEATH: 'timelineIssue.CHILD_AFTER_PARENT_DEATH',
  LIVING_WITH_DEATH: 'timelineIssue.LIVING_WITH_DEATH',
  LIVING_TOO_OLD: 'timelineIssue.LIVING_TOO_OLD',
};

/** Clés i18n de la gravité d'une incohérence. */
export const SEVERITY_KEYS = {
  CERTAIN: 'timelineIssue.severity.certain',
  POSSIBLE: 'timelineIssue.severity.possible',
};

/**
 * Libellés traduits des incohérences et de leur gravité.
 *
 * Une code d'issue inconnu retombe sur son code brut : l'affichage reste la
 * donnée d'origine, jamais une chaîne vide.
 */
export function useVerificationLabels() {
  const { t } = useTranslation();
  return {
    issueLabel: (code) => t(TIMELINE_ISSUE_KEYS[code] ?? 'timelineIssue.generic', {}, code),
    severityLabel: (severity) =>
      t(SEVERITY_KEYS[severity] ?? 'timelineIssue.severity.possible', {}, severity),
  };
}

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
    addIssue(byPerson, left.id, {
      key,
      kind: 'duplicate',
      score: pair.score,
      reasons: pair.reasons ?? [],
      other: right,
    });
    addIssue(byPerson, right.id, {
      key,
      kind: 'duplicate',
      score: pair.score,
      reasons: pair.reasons ?? [],
      other: left,
    });
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
//
// `t` est la fonction de traduction de l'appelant : la notification est
// rédigée dans la langue de l'utilisateur, pas dans celle du serveur.
export function verificationNotifications(byPerson, t = (key) => key) {
  const groups = new Map();
  const addToGroup = (groupKey, factory) => {
    if (!groups.has(groupKey)) {
      groups.set(groupKey, { count: 0, factory });
    }
    groups.get(groupKey).count += 1;
  };

  // Forme plurielle traduite : le nombre est formaté par la locale, et le
  // libellé s'accorde réellement (« 1 375 enfants nés avant leur parent »).
  const counted = (count, key) => t(key, { count });

  const seenIssueKeys = new Set();
  for (const issues of byPerson.values()) {
    for (const issue of issues) {
      if (seenIssueKeys.has(issue.key)) continue;
      seenIssueKeys.add(issue.key);
      if (issue.kind === 'duplicate') {
        addToGroup('duplicate', (count) => ({
          type: 'warning',
          title: t('timelineIssue.duplicatesTitle'),
          message: t('timelineIssue.duplicatesHint', {
            counted: counted(count, 'timelineIssue.duplicatesPlural'),
          }),
        }));
      } else if (issue.kind === 'cycle') {
        addToGroup('cycle', (count) => ({
          type: 'danger',
          title: t('timelineIssue.cyclesTitle'),
          message: t('timelineIssue.cyclesHint', {
            counted: counted(count, 'timelineIssue.cyclesPlural'),
          }),
        }));
      } else {
        const issueKey = TIMELINE_ISSUE_KEYS[issue.code];
        addToGroup(`timeline:${issue.code}`, (count) => ({
          type: issue.severity === 'CERTAIN' ? 'danger' : 'warning',
          title: t(issueKey ?? 'timelineIssue.generic', {}, issue.code),
          message: t('timelineIssue.cyclesHint', {
            counted: counted(
              count,
              issueKey ? `${issueKey}.plural` : 'timelineIssue.genericPlural',
            ),
          }),
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
  const { t } = useTranslation();
  const tRef = useRef(t);
  tRef.current = t;

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
      const items = verificationNotifications(byPerson, tRef.current);
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
