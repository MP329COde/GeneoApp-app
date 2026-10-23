import { useEffect, useState } from 'react';
import { Badge, useTranslation } from '../design-system/index.js';
import { ErrorNotice, personLabel } from '../components/shared.jsx';

const LINK_KEYS = {
  BIOLOGICAL: 'family.sheet.link.BIOLOGICAL',
  ADOPTIVE: 'family.sheet.link.ADOPTIVE',
  FOSTER: 'family.sheet.link.FOSTER',
  STEP: 'family.sheet.link.STEP',
  GUARDIAN: 'family.sheet.link.GUARDIAN',
  UNKNOWN: 'family.sheet.link.UNKNOWN',
};

// Fiche d'une famille : partenaires, enfants (avec la nature de chaque lien de
// filiation) et événements de début et de fin de l'union.
export function FamilySheet({ client, unionId, onNavigate }) {
  const { t } = useTranslation();
  const [sheet, setSheet] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    setSheet(null);
    client.unions
      .family(unionId)
      .then((data) => active && setSheet(data))
      .catch((loadError) => active && setError(loadError.message));
    return () => {
      active = false;
    };
  }, [client, unionId]);

  if (error) return <ErrorNotice message={error} />;
  if (!sheet) return <p role="status">{t('family.loading', 'Chargement…')}</p>;

  const eventLine = (label, event) =>
    event ? (
      <p className="data-id">
        {label} : {event.date_text ?? event.date_start ?? '—'}
      </p>
    ) : null;

  return (
    <section className="family-sheet" aria-label={t('family.sheet.title', 'Fiche famille')}>
      <h4>{t('family.sheet.partners', 'Partenaires')}</h4>
      <ul className="search-results">
        {sheet.partners.map((partner) => (
          <li key={partner.id}>
            <button type="button" className="link-button" onClick={() => onNavigate?.(partner.id)}>
              {personLabel(partner)}
            </button>
          </li>
        ))}
      </ul>
      {eventLine(t('family.sheet.start', 'Début'), sheet.startEvent)}
      {eventLine(t('family.sheet.end', 'Fin'), sheet.endEvent)}
      <h4>{t('family.sheet.children', 'Enfants')}</h4>
      {sheet.children.length === 0 ? (
        <p className="notice">
          {t('family.sheet.noChildren', 'Aucun enfant rattaché à cette union.')}
        </p>
      ) : (
        <ul className="search-results">
          {sheet.children.map((child) => (
            <li key={child.id}>
              <button type="button" className="link-button" onClick={() => onNavigate?.(child.id)}>
                {personLabel(child)}
              </button>{' '}
              {[...new Set(child.links.map((link) => link.linkType))].map((linkType) => (
                <Badge key={linkType} tone="neutral">
                  {t(LINK_KEYS[linkType] ?? LINK_KEYS.UNKNOWN, linkType)}
                </Badge>
              ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
