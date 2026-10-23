import { useI18n } from '../design-system/index.js';

export function personLabel(person) {
  return `${person.given_names} ${person.family_name}`;
}

// Icônes au trait (grille 24, trait 1.5, extrémités carrées, currentColor),
// conformes à la section Iconographie du design système.
export const ICON_PATHS = {
  tree: 'M12 4v4M6 12h12M6 12v4M18 12v4M12 8v4M9 4h6v4H9zM3 16h6v4H3zM15 16h6v4h-6z',
  person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  family:
    'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14a6.5 6.5 0 0 1 3.5 6',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  source: 'M5 3h10l4 4v14H5zM9 9h6M9 13h6M9 17h4',
  media: 'M3 5h18v14H3zM3 16l5-5 5 5 3-3 5 5M15.5 9.5h.01',
  event: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  timeline: 'M3 12h18M7 8v8M12 5v14M17 9v6',
  map: 'M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  duplicate: 'M8 8h12v12H8zM4 16V4h12',
  warning: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  notebook: 'M6 3h13v18H6zM3 7h3M3 12h3M3 17h3M10 8h6M10 12h6',
  stats: 'M4 20V10M10 20V4M16 20v-8M3 20h18',
  file: 'M6 3h9l4 4v14H6zM15 3v4h4',
  backup: 'M4 5h16v5H4zM4 10h16v9H4zM8 14h8',
  note: 'M4 4h16v12l-4 4H4zM16 20v-4h4',
  history: 'M3 12a9 9 0 1 0 3-6.7M3 4v4h4M12 7v5l3 3',
  chip: 'M7 7h10v10H7zM10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4',
  undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  redo: 'M15 14l5-5-5-5M20 9H9a5 5 0 0 0 0 10h3',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  panel: 'M3 4h18v16H3zM15 4v16',
  print: 'M6 9V3h12v6M6 18H4v-7h16v7h-2M6 14h12v7H6z',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  offline: 'M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01',
  bell: 'M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
  'chevron-right': 'M9 5l7 7-7 7',
  'chevron-down': 'M5 9l7 7 7-7',
};

export function Icon({ name }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

// Détecte les messages d'erreur techniques (réseau, parsing…) qui ne disent
// pas à l'utilisateur quoi faire, pour leur adjoindre une consigne concrète
// traduite. Les messages métier (ex. "GEDCOM invalide : ...") restent
// affichés tels quels : ils sont déjà clairs et actionnables.
export function errorHintKey(message) {
  const value = String(message ?? '');
  if (/failed to fetch|networkerror|ECONNREFUSED|ERR_NETWORK/i.test(value)) {
    return 'error.hint.network';
  }
  if (/timed? ?out|ETIMEDOUT/i.test(value)) {
    return 'error.hint.timeout';
  }
  if (/unexpected token|JSON\.parse|SyntaxError/i.test(value)) {
    return 'error.hint.corruptResponse';
  }
  return null;
}

export function ErrorNotice({ message, className = '' }) {
  const { t } = useI18n();
  const hintKey = errorHintKey(message);
  return (
    <p role="alert" className={`notice notice--error${className ? ` ${className}` : ''}`}>
      <span>{message}</span>
      {hintKey ? (
        <span className="notice__hint">
          {' '}
          {t(hintKey, {}, 'Réessayez ; si le problème persiste, vérifiez votre connexion.')}
        </span>
      ) : null}
    </p>
  );
}
