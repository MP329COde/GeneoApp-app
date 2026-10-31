import { Fragment } from 'react';
import { useTranslation } from '../design-system/index.js';
import { excerptParts, highlightParts } from '../genealogy/search-text.js';
import { Icon } from './shared.jsx';

// Type d'élément trouvé → icône et clé de libellé (singulier / pluriel).
export const RESULT_TYPES = {
  PERSON: { icon: 'person', label: 'search.entity.person', plural: 'search.entityPlural.person' },
  SOURCE: { icon: 'source', label: 'search.entity.source', plural: 'search.entityPlural.source' },
  MEDIA: { icon: 'media', label: 'search.entity.media', plural: 'search.entityPlural.media' },
  EVENT: { icon: 'event', label: 'search.entity.event', plural: 'search.entityPlural.event' },
  PLACE: { icon: 'map', label: 'search.entity.place', plural: 'search.entityPlural.place' },
  UNION: { icon: 'family', label: 'search.entity.union', plural: 'search.entityPlural.union' },
  PARENTAGE: {
    icon: 'tree',
    label: 'search.entity.parentage',
    plural: 'search.entityPlural.parentage',
  },
};

/** Texte dont les termes trouvés sont enveloppés dans des `<mark>`. */
export function Highlight({ parts }) {
  return parts.map((part, index) =>
    part.match ? (
      <mark key={index}>{part.text}</mark>
    ) : (
      <Fragment key={index}>{part.text}</Fragment>
    ),
  );
}

/**
 * Carte de résultat : type en badge + icône, titre en empattement, repères
 * (dates de vie, lieu), extrait surligné. Toute la carte est un bouton :
 * clic ou Entrée ouvre l'élément.
 */
export function SearchResultCard({
  type,
  title,
  term = '',
  dates,
  place,
  id,
  excerpt,
  extras = [],
  onOpen,
}) {
  const { t } = useTranslation();
  const meta = RESULT_TYPES[type] ?? RESULT_TYPES.PERSON;
  const excerptSegments = excerpt ? excerptParts(excerpt, term) : null;
  return (
    <li className="result-card-item">
      <button
        type="button"
        className="result-card"
        data-type={type}
        data-result-card
        onClick={onOpen}
        onKeyDown={handleCardKeys}
      >
        <span className="result-card__icon" aria-hidden="true">
          <Icon name={meta.icon} />
        </span>
        <span className="result-card__body">
          <span className="result-card__head">
            <span className="result-card__title">
              <Highlight parts={highlightParts(title, term)} />
            </span>
            <span className="result-card__type">{t(meta.label, type)}</span>
          </span>
          {dates || place || id ? (
            <span className="result-card__meta">
              {dates ? <span className="result-card__dates">{dates}</span> : null}
              {place ? <span className="result-card__place">{place}</span> : null}
              {id ? <span className="data-id">#{id}</span> : null}
            </span>
          ) : null}
          {extras.length > 0 ? (
            <span className="result-card__extras">
              {extras.map((extra, index) => (
                <span key={index} className="result-card__extra">
                  {extra}
                </span>
              ))}
            </span>
          ) : null}
          {excerptSegments ? (
            <span className="result-card__excerpt">
              <Highlight parts={excerptSegments} />
            </span>
          ) : null}
        </span>
        <span className="result-card__chevron" aria-hidden="true">
          <Icon name="chevron-right" />
        </span>
      </button>
    </li>
  );
}

/**
 * Navigation au clavier dans une zone de cartes : flèches haut/bas, Début et
 * Fin déplacent le focus d'une carte à l'autre.
 */
function handleCardKeys(event) {
  const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
  if (!keys.includes(event.key)) return;
  const root = event.currentTarget.closest('.search-panel') ?? document;
  const cards = [...root.querySelectorAll('[data-result-card]')];
  const index = cards.indexOf(event.currentTarget);
  if (index === -1) return;
  event.preventDefault();
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? cards.length - 1
        : Math.min(cards.length - 1, Math.max(0, index + (event.key === 'ArrowDown' ? 1 : -1)));
  cards[next]?.focus();
}

/** Cartes fantômes pendant le chargement. */
export function ResultSkeleton({ count = 3 }) {
  return (
    <ul className="result-skeleton" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <li key={index} className="result-skeleton__card">
          <span className="result-skeleton__icon" />
          <span className="result-skeleton__lines">
            <span className="result-skeleton__line result-skeleton__line--title" />
            <span className="result-skeleton__line" />
          </span>
        </li>
      ))}
    </ul>
  );
}
