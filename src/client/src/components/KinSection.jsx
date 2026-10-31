import { useEffect, useId, useRef } from 'react';
import { Badge, useTranslation } from '../design-system/index.js';
import { personLabel } from './shared.jsx';
import { PersonAvatar } from './PersonAvatar.jsx';
import { RowMenu } from './RowMenu.jsx';

/**
 * Section de l'écran Familles (Parents / Unions / Enfants) : titre serif avec
 * compteur, bouton « + Ajouter » qui déplie un formulaire en ligne, liste ou
 * état vide soigné. Le focus entre dans le formulaire à l'ouverture et revient
 * sur le bouton à la fermeture (Échap ou envoi).
 */
export function KinSection({
  title,
  count,
  loading,
  addLabel,
  formOpen,
  onToggleForm,
  addRef,
  form,
  emptyText,
  emptyHint,
  children,
}) {
  const { t } = useTranslation();
  const uid = useId();
  const formRef = useRef(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (formOpen && !wasOpen.current) {
      formRef.current?.querySelector('input:not([type="radio"]):not([hidden]), button')?.focus();
    }
    wasOpen.current = formOpen;
  }, [formOpen]);

  const empty = !loading && count === 0;

  return (
    <section className="kin-section" aria-labelledby={`${uid}-title`}>
      <header className="kin-section__header">
        <h4 className="kin-section__title" id={`${uid}-title`}>
          {title}
          {count ? <span className="kin-section__count">{count}</span> : null}
        </h4>
        <button
          ref={addRef}
          type="button"
          className="kin-add"
          aria-expanded={formOpen}
          aria-controls={`${uid}-form`}
          onClick={onToggleForm}
        >
          <span aria-hidden="true" className="kin-add__plus">
            {formOpen ? '−' : '+'}
          </span>
          {addLabel}
        </button>
      </header>
      {/* Échap est capté au passage depuis les champs du formulaire (bulle). */}
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div
        id={`${uid}-form`}
        ref={formRef}
        hidden={!formOpen}
        className="kin-form-wrap"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && formOpen) {
            event.preventDefault();
            onToggleForm();
            addRef?.current?.focus();
          }
        }}
      >
        {formOpen ? form : null}
      </div>
      {loading ? (
        <p role="status" className="kin-loading">
          {t('kin.loading', 'Chargement…')}
        </p>
      ) : empty ? (
        <div className="kin-empty">
          <p className="kin-empty__text">{emptyText}</p>
          {emptyHint ? <p className="kin-empty__hint">{emptyHint}</p> : null}
        </div>
      ) : (
        children
      )}
    </section>
  );
}

/** Ligne de personne : avatar, nom serif cliquable, dates de vie, badge, menu « … ». */
export function PersonRow({
  person,
  fallbackName,
  info,
  badge,
  onOpen,
  menuLabel,
  menuItems,
  menuRef,
  disabled,
}) {
  const { t } = useTranslation();
  const name = person ? personLabel(person) : fallbackName;
  const meta = [info?.label, info?.birthPlace].filter(Boolean).join(' · ');
  return (
    <li className="kin-row">
      <PersonAvatar person={person ?? { id: 0, given_names: '?', family_name: '' }} size={40} />
      <div className="kin-row__body">
        <button
          type="button"
          className="kin-row__name"
          onClick={onOpen}
          title={t('kin.open', { name }, 'Ouvrir la fiche de {name}')}
        >
          {name}
        </button>
        {meta ? <span className="kin-row__meta">{meta}</span> : null}
      </div>
      {badge ? <Badge tone="neutral">{badge}</Badge> : null}
      <RowMenu ref={menuRef} label={menuLabel} items={menuItems} disabled={disabled} />
    </li>
  );
}
