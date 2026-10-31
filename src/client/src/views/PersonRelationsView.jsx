import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, ConfirmDialog, useTranslation } from '../design-system/index.js';
import { client } from '../api/app-client.js';
import { personLabel } from '../components/shared.jsx';
import { KinSection, PersonRow } from '../components/KinSection.jsx';
import { PersonPicker } from '../components/PersonPicker.jsx';
import { ChoiceChips } from '../components/ChoiceChips.jsx';
import { PARENT_ROLES, PARENT_ROLE_KEYS } from './PersonListPanels.jsx';

/**
 * État et actions de la parenté d'une personne (parents et enfants). Partagé
 * par les sections « Parents » et « Enfants » de l'écran Familles.
 */
export function useParentage({ persons, selected, onChange, onFeedback }) {
  const { t } = useTranslation();
  const [parents, setParents] = useState(null);
  const [children, setChildren] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [linkToRemove, setLinkToRemove] = useState(null);

  const load = useCallback(async () => {
    if (!selected) return;
    try {
      const [parentList, childList] = await Promise.all([
        client.parentages.listParentsOf(selected.id),
        client.parentages.listChildrenOf(selected.id),
      ]);
      setParents(parentList);
      setChildren(childList);
    } catch (loadError) {
      setError(loadError.message);
    }
  }, [selected]);

  useEffect(() => {
    setParents(null);
    setChildren(null);
    load();
  }, [load]);

  const nameOf = useCallback(
    (id) => {
      const person = persons.find((candidate) => candidate.id === id);
      return person ? personLabel(person) : t('kin.unknownPerson', { id }, 'Personne #{id}');
    },
    [persons, t],
  );

  const link = async (payload, message) => {
    setBusy(true);
    setError(null);
    try {
      await client.parentages.create(payload);
      await load();
      await onChange?.();
      onFeedback?.(message);
      return true;
    } catch (createError) {
      setError(createError.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const addParent = (parentId, parentRole) =>
    link(
      { childId: selected.id, parentId: Number(parentId), parentRole },
      t('kin.parentAdded', { name: nameOf(Number(parentId)) }, 'Parent ajouté : {name}.'),
    );

  const addChild = (childId) =>
    link(
      { childId: Number(childId), parentId: selected.id, parentRole: 'PARENT' },
      t('kin.childAdded', { name: nameOf(Number(childId)) }, 'Enfant ajouté : {name}.'),
    );

  const remove = async () => {
    if (!linkToRemove) return false;
    setBusy(true);
    setError(null);
    let done = false;
    try {
      await client.parentages.remove(linkToRemove.id);
      await load();
      await onChange?.();
      onFeedback?.(
        t('kin.removed', { name: linkToRemove.name }, 'Lien de parenté retiré : {name}.'),
      );
      done = true;
    } catch (removeError) {
      console.error(t('kin.removeError', 'Échec du retrait du lien de parenté'), removeError);
      setError(
        t(
          'kin.removeErrorDetail',
          'Le retrait du lien de parenté a échoué. Vérifiez votre connexion locale et réessayez.',
        ),
      );
    } finally {
      setBusy(false);
      setLinkToRemove(null);
    }
    return done;
  };

  return {
    parents,
    children,
    error,
    busy,
    nameOf,
    addParent,
    addChild,
    linkToRemove,
    askRemove: setLinkToRemove,
    remove,
  };
}

/** Boîte de confirmation partagée pour le retrait d'un lien de parenté. */
export function KinRemoveDialog({ kin, onClosed }) {
  const { t } = useTranslation();
  return (
    <ConfirmDialog
      isOpen={kin.linkToRemove !== null}
      title={t('confirmDialog.kinTitle', 'Retirer le lien de parenté')}
      message={t(
        'kin.removeConfirm',
        'Retirer ce lien de parenté ? Cette action peut être refaite manuellement si besoin.',
      )}
      confirmLabel={t('confirmDialog.kinAction', 'Retirer le lien')}
      isBusy={kin.busy}
      onConfirm={async () => onClosed(kin.linkToRemove, await kin.remove())}
      onCancel={() => {
        const pending = kin.linkToRemove;
        kin.askRemove(null);
        onClosed(pending, false);
      }}
    />
  );
}

function usePersonLookup(persons) {
  return useMemo(() => new Map(persons.map((person) => [person.id, person])), [persons]);
}

function AddForm({ children, submitLabel, disabled, onSubmit, onCancel }) {
  const { t } = useTranslation();
  return (
    <form className="kin-form" onSubmit={onSubmit}>
      {children}
      <div className="kin-form__actions">
        <Button type="submit" size="sm" disabled={disabled}>
          {submitLabel}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={onCancel}>
          {t('kin.cancel', 'Annuler')}
        </Button>
      </div>
    </form>
  );
}

export function ParentsSection({
  kin,
  persons,
  selected,
  lifespans,
  onNavigate,
  menuRefs,
  addRef,
}) {
  const { t } = useTranslation();
  const lookup = usePersonLookup(persons);
  const [open, setOpen] = useState(false);
  const [parentId, setParentId] = useState('');
  const [role, setRole] = useState('PARENT');

  const exclude = useMemo(
    () => [
      selected.id,
      ...(kin.parents ?? []).map((link) => link.parent_id),
      ...(kin.children ?? []).map((link) => link.child_id),
    ],
    [selected, kin.parents, kin.children],
  );

  const submit = async (event) => {
    event.preventDefault();
    if (!parentId) return;
    if (await kin.addParent(parentId, role)) {
      setParentId('');
      setOpen(false);
      addRef.current?.focus();
    }
  };

  return (
    <KinSection
      title={t('kin.parentsTitle', 'Parents')}
      count={kin.parents?.length ?? 0}
      loading={kin.parents === null}
      addLabel={t('kin.addParent', 'Ajouter un parent')}
      formOpen={open}
      onToggleForm={() => setOpen((value) => !value)}
      addRef={addRef}
      emptyText={t('kin.noParents', 'Aucun parent enregistré.')}
      emptyHint={t(
        'kin.noParentsHint',
        'Ajoutez un père, une mère ou un parent pour remonter l’arbre.',
      )}
      form={
        <AddForm
          submitLabel={t('kin.addParentSubmit', 'Ajouter le parent')}
          disabled={kin.busy || !parentId}
          onSubmit={submit}
          onCancel={() => {
            setOpen(false);
            addRef.current?.focus();
          }}
        >
          <PersonPicker
            label={t('kin.parentField', 'Parent')}
            persons={persons}
            value={parentId}
            onChange={setParentId}
            excludeIds={exclude}
            lifespans={lifespans}
          />
          <ChoiceChips
            legend={t('kin.role', 'Rôle')}
            value={role}
            onChange={setRole}
            options={PARENT_ROLES.map((value) => ({
              value,
              label: t(PARENT_ROLE_KEYS[value] ?? '', value),
            }))}
          />
        </AddForm>
      }
    >
      <ul className="kin-list">
        {(kin.parents ?? []).map((parentage) => {
          const name = kin.nameOf(parentage.parent_id);
          return (
            <PersonRow
              key={parentage.id}
              person={lookup.get(parentage.parent_id)}
              fallbackName={name}
              info={lifespans?.get(parentage.parent_id)}
              badge={t(PARENT_ROLE_KEYS[parentage.parent_role] ?? '', parentage.parent_role)}
              onOpen={() => onNavigate(parentage.parent_id)}
              menuLabel={t('kin.actionsFor', { name }, 'Actions pour {name}')}
              menuRef={(node) => {
                if (node) menuRefs.current.set(`p${parentage.id}`, node);
                else menuRefs.current.delete(`p${parentage.id}`);
              }}
              disabled={kin.busy}
              menuItems={[
                {
                  key: 'remove',
                  label: t('kin.removeParent', 'Retirer ce parent'),
                  danger: true,
                  onSelect: () => kin.askRemove({ id: parentage.id, name, kind: 'parent' }),
                },
              ]}
            />
          );
        })}
      </ul>
    </KinSection>
  );
}

export function ChildrenSection({
  kin,
  persons,
  selected,
  lifespans,
  onNavigate,
  menuRefs,
  addRef,
}) {
  const { t } = useTranslation();
  const lookup = usePersonLookup(persons);
  const [open, setOpen] = useState(false);
  const [childId, setChildId] = useState('');

  const exclude = useMemo(
    () => [
      selected.id,
      ...(kin.children ?? []).map((link) => link.child_id),
      ...(kin.parents ?? []).map((link) => link.parent_id),
    ],
    [selected, kin.parents, kin.children],
  );

  const submit = async (event) => {
    event.preventDefault();
    if (!childId) return;
    if (await kin.addChild(childId)) {
      setChildId('');
      setOpen(false);
      addRef.current?.focus();
    }
  };

  return (
    <KinSection
      title={t('kin.childrenTitle', 'Enfants')}
      count={kin.children?.length ?? 0}
      loading={kin.children === null}
      addLabel={t('kin.addChild', 'Ajouter un enfant')}
      formOpen={open}
      onToggleForm={() => setOpen((value) => !value)}
      addRef={addRef}
      emptyText={t('kin.noChildren', 'Aucun enfant enregistré.')}
      emptyHint={t(
        'kin.noChildrenHint',
        'Rattachez ici les enfants nés ou adoptés de cette personne.',
      )}
      form={
        <AddForm
          submitLabel={t('kin.addChildSubmit', 'Ajouter l’enfant')}
          disabled={kin.busy || !childId}
          onSubmit={submit}
          onCancel={() => {
            setOpen(false);
            addRef.current?.focus();
          }}
        >
          <PersonPicker
            label={t('kin.childField', 'Enfant')}
            persons={persons}
            value={childId}
            onChange={setChildId}
            excludeIds={exclude}
            lifespans={lifespans}
          />
        </AddForm>
      }
    >
      <ul className="kin-list">
        {(kin.children ?? []).map((parentage) => {
          const name = kin.nameOf(parentage.child_id);
          return (
            <PersonRow
              key={parentage.id}
              person={lookup.get(parentage.child_id)}
              fallbackName={name}
              info={lifespans?.get(parentage.child_id)}
              onOpen={() => onNavigate(parentage.child_id)}
              menuLabel={t('kin.actionsFor', { name }, 'Actions pour {name}')}
              menuRef={(node) => {
                if (node) menuRefs.current.set(`p${parentage.id}`, node);
                else menuRefs.current.delete(`p${parentage.id}`);
              }}
              disabled={kin.busy}
              menuItems={[
                {
                  key: 'remove',
                  label: t('kin.removeChild', 'Retirer cet enfant'),
                  danger: true,
                  onSelect: () => kin.askRemove({ id: parentage.id, name, kind: 'child' }),
                },
              ]}
            />
          );
        })}
      </ul>
    </KinSection>
  );
}
