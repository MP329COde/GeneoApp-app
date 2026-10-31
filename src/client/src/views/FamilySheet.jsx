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

/**
 * Charge la fiche d'une famille (partenaires, enfants, événements de début et
 * de fin). Renvoie `null` tant que les données ne sont pas là, ou en cas
 * d'échec (la carte reste alors affichable sans le détail).
 */
export function useFamilyData(client, unionId, refreshKey = 0) {
  const [state, setState] = useState({ data: null, error: null });
  useEffect(() => {
    let active = true;
    if (typeof client?.unions?.family !== 'function') return undefined;
    Promise.resolve(client.unions.family(unionId))
      .then((data) => active && setState({ data, error: null }))
      .catch((loadError) => active && setState({ data: null, error: loadError.message }));
    return () => {
      active = false;
    };
  }, [client, unionId, refreshKey]);
  return state;
}

// Fiche d'une famille : partenaires, enfants (avec la nature de chaque lien de
// filiation) et événements de début et de fin de l'union.
export function FamilySheet({ client, unionId, onNavigate, data = null, error = null }) {
  const { t } = useTranslation();
  const [own, setOwn] = useState({ data: null, error: null });

  useEffect(() => {
    if (data || error) return undefined;
    let active = true;
    Promise.resolve(client.unions.family(unionId))
      .then((result) => active && setOwn({ data: result, error: null }))
      .catch((loadError) => active && setOwn({ data: null, error: loadError.message }));
    return () => {
      active = false;
    };
  }, [client, unionId, data, error]);

  const sheet = data ?? own.data;
  const failure = error ?? own.error;

  if (failure) return <ErrorNotice message={failure} />;
  if (!sheet) return <p role="status">{t('family.loading', 'Chargement…')}</p>;

  const eventLine = (label, event) => (
    <div className="family-sheet__fact">
      <dt>{label}</dt>
      <dd>{event ? (event.date_text ?? event.date_start ?? '—') : '—'}</dd>
    </div>
  );

  return (
    <section className="family-sheet" aria-label={t('family.sheet.title', 'Fiche famille')}>
      <dl className="family-sheet__facts">
        {eventLine(t('family.sheet.start', 'Début'), sheet.startEvent)}
        {eventLine(t('family.sheet.end', 'Fin'), sheet.endEvent)}
      </dl>
      <h5 className="family-sheet__heading">{t('family.sheet.partners', 'Partenaires')}</h5>
      <ul className="family-sheet__list">
        {sheet.partners.map((partner) => (
          <li key={partner.id}>
            <button type="button" className="link-button" onClick={() => onNavigate?.(partner.id)}>
              {personLabel(partner)}
            </button>
          </li>
        ))}
      </ul>
      <h5 className="family-sheet__heading">{t('family.sheet.children', 'Enfants')}</h5>
      {sheet.children.length === 0 ? (
        <p className="kin-empty__hint">
          {t('family.sheet.noChildren', 'Aucun enfant rattaché à cette union.')}
        </p>
      ) : (
        <ul className="family-sheet__list">
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
