import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, ConfirmDialog, useTranslation } from '../design-system/index.js';
import { client } from '../api/app-client.js';
import { ErrorNotice, personLabel } from '../components/shared.jsx';
import { ActionToast } from '../components/ActionToast.jsx';
import { ChoiceChips } from '../components/ChoiceChips.jsx';
import { KinSection } from '../components/KinSection.jsx';
import { PersonAvatar } from '../components/PersonAvatar.jsx';
import { PersonPicker } from '../components/PersonPicker.jsx';
import { RowMenu } from '../components/RowMenu.jsx';
import { UNION_TYPES, UNION_TYPE_KEYS } from './PersonListPanels.jsx';
import { FamilySheet, useFamilyData } from './FamilySheet.jsx';
import {
  ChildrenSection,
  KinRemoveDialog,
  ParentsSection,
  useParentage,
} from './PersonRelationsView.jsx';

function UnionCard({
  union,
  selected,
  persons,
  lifespans,
  refreshKey,
  busy,
  menuRef,
  onNavigate,
  onAskRemove,
}) {
  const { t } = useTranslation();
  const [sheetOpen, setSheetOpen] = useState(false);
  const { data, error } = useFamilyData(client, union.id, refreshKey);
  const partnerIds = union.partnerIds.filter((id) => id !== selected.id);
  const partners = partnerIds.map((id) => persons.find((p) => p.id === id) ?? { id });
  const typeLabel = t(UNION_TYPE_KEYS[union.type] ?? '', union.type);
  const names = partners.map((p) =>
    p.given_names === undefined
      ? t('kin.unknownPerson', { id: p.id }, 'Personne #{id}')
      : personLabel(p),
  );
  const startText = data?.startEvent && (data.startEvent.date_text ?? data.startEvent.date_start);
  const endText = data?.endEvent && (data.endEvent.date_text ?? data.endEvent.date_start);
  const children = data?.children ?? [];

  return (
    <li className="union-card">
      <div className="union-card__top">
        <div className="union-card__avatars">
          {partners.map((p) => (
            <PersonAvatar key={p.id} person={p} size={48} />
          ))}
        </div>
        <div className="union-card__who">
          {partners.map((p, index) => {
            const info = lifespans?.get(p.id);
            const meta = [info?.label, info?.birthPlace].filter(Boolean).join(' · ');
            return (
              <div key={p.id} className="union-card__partner">
                <button type="button" className="kin-row__name" onClick={() => onNavigate(p.id)}>
                  {names[index]}
                </button>
                {meta ? <span className="kin-row__meta">{meta}</span> : null}
              </div>
            );
          })}
          <div className="union-card__facts">
            <Badge tone="neutral">{typeLabel}</Badge>
            {startText ? (
              <span className="union-card__date">
                {t('family.sheet.start', 'Début')} : {startText}
              </span>
            ) : null}
            {endText ? (
              <span className="union-card__date">
                {t('family.sheet.end', 'Fin')} : {endText}
              </span>
            ) : null}
          </div>
        </div>
        <RowMenu
          ref={menuRef}
          label={t(
            'family.actionsFor',
            { name: names.join(', ') },
            'Actions pour l’union avec {name}',
          )}
          disabled={busy}
          items={[
            {
              key: 'remove',
              label: t('family.remove', 'Dissoudre / supprimer'),
              danger: true,
              onSelect: () => onAskRemove({ id: union.id, name: names.join(', ') }),
            },
          ]}
        />
      </div>

      <div className="union-card__children">
        <span className="union-card__children-label" id={`union-${union.id}-children`}>
          {t('family.childrenLabel', { count: children.length }, 'Enfants ({count})')}
        </span>
        {children.length === 0 ? (
          <span className="kin-row__meta">
            {t('family.sheet.noChildren', 'Aucun enfant rattaché à cette union.')}
          </span>
        ) : (
          <ul className="chip-list" aria-labelledby={`union-${union.id}-children`}>
            {children.map((child) => (
              <li key={child.id}>
                <button type="button" className="person-chip" onClick={() => onNavigate(child.id)}>
                  <PersonAvatar person={child} size={22} />
                  <span>{personLabel(child)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="union-card__footer">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          aria-expanded={sheetOpen}
          onClick={() => setSheetOpen((value) => !value)}
        >
          {sheetOpen
            ? t('family.sheet.hide', 'Masquer la fiche')
            : t('family.sheet.show', 'Fiche famille')}
        </Button>
      </div>
      {sheetOpen ? (
        <FamilySheet
          client={client}
          unionId={union.id}
          onNavigate={onNavigate}
          data={data}
          error={error}
        />
      ) : null}
    </li>
  );
}

function UnionsSection({
  unions,
  selected,
  persons,
  lifespans,
  kin,
  onNavigate,
  onCreated,
  busy,
  setBusy,
  setError,
  menuRefs,
  addRef,
  onAskRemove,
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('MARRIAGE');
  const [partnerId, setPartnerId] = useState('');

  const exclude = useMemo(
    () => [selected.id, ...(unions ?? []).flatMap((union) => union.partnerIds)],
    [selected, unions],
  );

  const submit = async (event) => {
    event.preventDefault();
    if (!partnerId) return;
    setBusy(true);
    setError(null);
    try {
      await client.unions.create({ type, partnerIds: [selected.id, Number(partnerId)] });
      const partner = persons.find((p) => p.id === Number(partnerId));
      setPartnerId('');
      setOpen(false);
      await onCreated(
        t(
          'family.created',
          { name: partner ? personLabel(partner) : partnerId },
          'Union créée avec {name}.',
        ),
      );
      addRef.current?.focus();
    } catch (createError) {
      setError(createError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KinSection
      title={t('family.unionsTitle', 'Unions')}
      count={unions?.length ?? 0}
      loading={unions === null}
      addLabel={t('family.addUnion', 'Ajouter une union')}
      formOpen={open}
      onToggleForm={() => setOpen((value) => !value)}
      addRef={addRef}
      emptyText={t('family.empty', 'Aucune union enregistrée pour cette personne.')}
      emptyHint={t(
        'family.emptyHint',
        'Ajoutez un mariage, un PACS ou une vie commune pour regrouper les enfants d’un couple.',
      )}
      form={
        <form className="kin-form" onSubmit={submit}>
          <PersonPicker
            label={t('family.partner', 'Partenaire')}
            persons={persons}
            value={partnerId}
            onChange={setPartnerId}
            excludeIds={exclude}
            lifespans={lifespans}
          />
          <ChoiceChips
            legend={t('family.unionType', 'Type d’union')}
            value={type}
            onChange={setType}
            options={UNION_TYPES.map((value) => ({
              value,
              label: t(UNION_TYPE_KEYS[value] ?? '', value),
            }))}
          />
          <div className="kin-form__actions">
            <Button type="submit" size="sm" disabled={busy || !partnerId}>
              {t('family.create', 'Créer l’union')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                setOpen(false);
                addRef.current?.focus();
              }}
            >
              {t('kin.cancel', 'Annuler')}
            </Button>
          </div>
        </form>
      }
    >
      <ul className="union-list">
        {(unions ?? []).map((union) => (
          <UnionCard
            key={union.id}
            union={union}
            selected={selected}
            persons={persons}
            lifespans={lifespans}
            refreshKey={kin.children?.length ?? 0}
            busy={busy}
            menuRef={(node) => {
              if (node) menuRefs.current.set(`u${union.id}`, node);
              else menuRefs.current.delete(`u${union.id}`);
            }}
            onNavigate={onNavigate}
            onAskRemove={onAskRemove}
          />
        ))}
      </ul>
    </KinSection>
  );
}

export function FamiliesPanel({ persons, selected, lifespans, onNavigate, onChange }) {
  const { t } = useTranslation();
  const [unions, setUnions] = useState(null);
  const [familiesError, setFamiliesError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [unionToRemove, setUnionToRemove] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const menuRefs = useRef(new Map());
  const parentAdd = useRef(null);
  const unionAdd = useRef(null);
  const childAdd = useRef(null);

  const announce = useCallback((text) => setFeedback({ id: Date.now(), text }), []);
  const dismiss = useCallback(() => setFeedback(null), []);

  const kin = useParentage({ persons, selected, onChange, onFeedback: announce });

  const loadUnions = useCallback(async () => {
    if (!selected) return;
    try {
      setUnions(await client.unions.listForPerson(selected.id));
    } catch (loadError) {
      setFamiliesError(loadError.message);
    }
  }, [selected]);

  useEffect(() => {
    setUnions(null);
    loadUnions();
  }, [loadUnions]);

  if (!selected) {
    return (
      <p className="notice">
        {t('family.selectPerson', 'Sélectionnez une personne pour voir et gérer ses familles.')}
      </p>
    );
  }

  const handleCreated = async (message) => {
    await loadUnions();
    await onChange?.();
    announce(message);
  };

  const handleRemove = async () => {
    const target = unionToRemove;
    if (!target) return;
    setBusy(true);
    setFamiliesError(null);
    let done = false;
    try {
      await client.unions.remove(target.id);
      await loadUnions();
      await onChange?.();
      announce(t('family.removed', 'Union dissoute.'));
      done = true;
    } catch (removeError) {
      console.error(t('family.removeError', "Échec de la suppression de l'union"), removeError);
      setFamiliesError(
        t(
          'family.removeErrorDetail',
          "La suppression de l'union a échoué. Vérifiez votre connexion locale et réessayez.",
        ),
      );
    } finally {
      setBusy(false);
      setUnionToRemove(null);
    }
    (done ? unionAdd.current : menuRefs.current.get(`u${target.id}`))?.focus();
  };

  const info = lifespans?.get(selected.id);
  const meta = [info?.label, info?.birthPlace].filter(Boolean).join(' · ');
  const error = familiesError ?? kin.error;

  return (
    <div className="search-panel families-panel">
      <header className="families-hero">
        <PersonAvatar person={selected} size={56} />
        <div>
          <h3 className="families-hero__title">
            {t('family.title', { name: personLabel(selected) }, 'Familles de {name}')}
          </h3>
          {meta ? <p className="families-hero__meta">{meta}</p> : null}
        </div>
      </header>

      {error ? <ErrorNotice message={error} /> : null}
      <ActionToast feedback={feedback} onDismiss={dismiss} />

      <ParentsSection
        kin={kin}
        persons={persons}
        selected={selected}
        lifespans={lifespans}
        onNavigate={onNavigate}
        menuRefs={menuRefs}
        addRef={parentAdd}
      />

      <UnionsSection
        unions={unions}
        selected={selected}
        persons={persons}
        lifespans={lifespans}
        kin={kin}
        onNavigate={onNavigate}
        onCreated={handleCreated}
        busy={busy}
        setBusy={setBusy}
        setError={setFamiliesError}
        menuRefs={menuRefs}
        addRef={unionAdd}
        onAskRemove={setUnionToRemove}
      />

      <ChildrenSection
        kin={kin}
        persons={persons}
        selected={selected}
        lifespans={lifespans}
        onNavigate={onNavigate}
        menuRefs={menuRefs}
        addRef={childAdd}
      />

      <KinRemoveDialog
        kin={kin}
        onClosed={(pending, done) => {
          if (!pending) return;
          if (done) {
            (pending.kind === 'child' ? childAdd : parentAdd).current?.focus();
          } else {
            menuRefs.current.get(`p${pending.id}`)?.focus();
          }
        }}
      />

      <ConfirmDialog
        isOpen={unionToRemove !== null}
        title={t('confirmDialog.unionTitle', 'Dissoudre / supprimer l’union')}
        message={t(
          'family.removeConfirm',
          'Dissoudre / supprimer cette union ? Cette action est irréversible.',
        )}
        confirmLabel={t('confirmDialog.unionAction', 'Dissoudre / supprimer')}
        isBusy={busy}
        onConfirm={handleRemove}
        onCancel={() => {
          const target = unionToRemove;
          setUnionToRemove(null);
          if (target) menuRefs.current.get(`u${target.id}`)?.focus();
        }}
      />
    </div>
  );
}
