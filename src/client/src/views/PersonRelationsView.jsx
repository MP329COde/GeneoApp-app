import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button } from '../design-system/index.js';
import { client } from '../api/app-client.js';
import { ErrorNotice, personLabel } from '../components/shared.jsx';
import { PARENT_ROLES, PARENT_ROLE_LABELS } from './PersonListPanels.jsx';

export function ParentageSection({ persons, selected, onNavigate, onChange }) {
  const [parents, setParents] = useState(null);
  const [children, setChildren] = useState(null);
  const [parentId, setParentId] = useState('');
  const [parentRole, setParentRole] = useState('PARENT');
  const [childId, setChildId] = useState('');
  const [parentageError, setParentageError] = useState(null);
  const [busy, setBusy] = useState(false);

  const otherPersons = useMemo(
    () => persons.filter((person) => person.id !== selected?.id),
    [persons, selected],
  );

  const loadParentage = useCallback(async () => {
    try {
      const [parentList, childList] = await Promise.all([
        client.parentages.listParentsOf(selected.id),
        client.parentages.listChildrenOf(selected.id),
      ]);
      setParents(parentList);
      setChildren(childList);
    } catch (loadError) {
      setParentageError(loadError.message);
    }
  }, [selected]);

  useEffect(() => {
    setParents(null);
    setChildren(null);
    loadParentage();
  }, [loadParentage]);

  const personLabelById = (id) => {
    const person = persons.find((candidate) => candidate.id === id);
    return person ? personLabel(person) : `Personne #${id}`;
  };

  const handleAddParent = async (event) => {
    event.preventDefault();
    if (!parentId) return;
    setBusy(true);
    setParentageError(null);
    try {
      await client.parentages.create({
        childId: selected.id,
        parentId: Number(parentId),
        parentRole,
      });
      setParentId('');
      await loadParentage();
      await onChange?.();
    } catch (createError) {
      setParentageError(createError.message);
    } finally {
      setBusy(false);
    }
  };

  const handleAddChild = async (event) => {
    event.preventDefault();
    if (!childId) return;
    setBusy(true);
    setParentageError(null);
    try {
      await client.parentages.create({
        childId: Number(childId),
        parentId: selected.id,
        parentRole: 'PARENT',
      });
      setChildId('');
      await loadParentage();
      await onChange?.();
    } catch (createError) {
      setParentageError(createError.message);
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (id) => {
    if (
      !window.confirm(
        'Retirer ce lien de parenté ? Cette action peut être refaite manuellement si besoin.',
      )
    ) {
      return;
    }
    setBusy(true);
    setParentageError(null);
    try {
      await client.parentages.remove(id);
      await loadParentage();
      await onChange?.();
    } catch (removeError) {
      console.error('Échec du retrait du lien de parenté', removeError);
      setParentageError(
        'Le retrait du lien de parenté a échoué. Vérifiez votre connexion locale et réessayez.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <h3>Parenté de {personLabel(selected)}</h3>
      {parentageError ? <ErrorNotice message={parentageError} /> : null}

      <form className="create-person-form" onSubmit={handleAddParent}>
        <label>
          <span>Ajouter un parent</span>
          <select value={parentId} onChange={(event) => setParentId(event.target.value)}>
            <option value="">— Choisir une personne —</option>
            {otherPersons.map((person) => (
              <option key={person.id} value={person.id}>
                {personLabel(person)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Rôle</span>
          <select value={parentRole} onChange={(event) => setParentRole(event.target.value)}>
            {PARENT_ROLES.map((role) => (
              <option key={role} value={role}>
                {PARENT_ROLE_LABELS[role] ?? role}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" size="sm" disabled={busy || !parentId}>
          Ajouter le parent
        </Button>
      </form>

      {parents === null ? (
        <p role="status">Chargement…</p>
      ) : (
        <ul className="search-results">
          {parents.map((parentage) => (
            <li key={parentage.id}>
              <Badge tone="neutral">
                {PARENT_ROLE_LABELS[parentage.parent_role] ?? parentage.parent_role}
              </Badge>{' '}
              <button
                type="button"
                className="person-card"
                style={{ display: 'inline', padding: 0, border: 0 }}
                onClick={() => onNavigate(parentage.parent_id)}
              >
                {personLabelById(parentage.parent_id)}
              </button>
              <Button
                type="button"
                size="sm"
                variant="danger"
                onClick={() => handleRemove(parentage.id)}
                disabled={busy}
              >
                Retirer
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form className="create-person-form" onSubmit={handleAddChild}>
        <label>
          <span>Ajouter un enfant</span>
          <select value={childId} onChange={(event) => setChildId(event.target.value)}>
            <option value="">— Choisir une personne —</option>
            {otherPersons.map((person) => (
              <option key={person.id} value={person.id}>
                {personLabel(person)}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" size="sm" disabled={busy || !childId}>
          Ajouter l’enfant
        </Button>
      </form>

      {children === null ? (
        <p role="status">Chargement…</p>
      ) : (
        <ul className="search-results">
          {children.map((parentage) => (
            <li key={parentage.id}>
              <button
                type="button"
                className="person-card"
                style={{ display: 'inline', padding: 0, border: 0 }}
                onClick={() => onNavigate(parentage.child_id)}
              >
                {personLabelById(parentage.child_id)}
              </button>
              <Button
                type="button"
                size="sm"
                variant="danger"
                onClick={() => handleRemove(parentage.id)}
                disabled={busy}
              >
                Retirer
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
