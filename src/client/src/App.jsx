import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Badge, Button, LanguageSwitcher } from './design-system/index.js';
import { createGeneoAppClient } from './api/geneoapp-client.js';
import {
  formatGenealogyDate,
  parseGenealogyDate,
  precisionOf,
} from '../../db/src/dates/genealogy-date.js';
import { withWriteNotifications } from './api/with-write-notifications.js';
import { TreeExplorer } from './views/TreeExplorer.jsx';
import { RelationshipPanel } from './views/RelationshipPanel.jsx';
import { buildLifespans } from './genealogy/lifespans.js';
import { PhotoViewer } from './views/PhotoViewer.jsx';
import { NotebookPanel } from './views/NotebookPanel.jsx';
import { TreesPanel } from './views/TreesPanel.jsx';
import { SettingsPanel } from './views/SettingsPanel.jsx';
import { SettingsProvider, useSettings } from './settings/SettingsContext.jsx';
import appIcon from './assets/geneoapp-icon.png';
import './App.css';

// Toute écriture réussie notifie l'App pour rafraîchir Annuler/Rétablir.
const writeListeners = new Set();
const client = withWriteNotifications(createGeneoAppClient(), () => {
  for (const listener of writeListeners) listener();
});

function personLabel(person) {
  return `${person.given_names} ${person.family_name}`;
}

// Icônes au trait (grille 24, trait 1.5, extrémités carrées, currentColor),
// conformes à la section Iconographie du design système.
const ICON_PATHS = {
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
  print: 'M6 9V3h12v6M6 18H4v-7h16v7h-2M6 14h12v7H6z',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  offline: 'M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01',
};

function Icon({ name }) {
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

// Architecture de navigation : vues regroupées en 4 familles (Explorer,
// Documenter, Vérifier, Données locales), comme dans les maquettes.
const NAV_GROUPS = [
  {
    label: 'Explorer',
    items: [
      { id: 'tree', label: 'Arbre', icon: 'tree', shortcut: '⌘1' },
      { id: 'person', label: 'Personne', icon: 'person', shortcut: '⌘2' },
      { id: 'families', label: 'Familles', icon: 'family', shortcut: '⌘3' },
      { id: 'search', label: 'Recherche', icon: 'search', shortcut: '⌘4' },
      { id: 'relations', label: 'Parenté', icon: 'family' },
    ],
  },
  {
    label: 'Documenter',
    items: [
      { id: 'sources', label: 'Sources', icon: 'source' },
      { id: 'media', label: 'Médias', icon: 'media' },
      { id: 'events', label: 'Événements', icon: 'event' },
      { id: 'timeline', label: 'Chronologie', icon: 'timeline' },
      { id: 'map', label: 'Carte', icon: 'map' },
      { id: 'notes', label: 'Notes', icon: 'note' },
    ],
  },
  {
    label: 'Vérifier',
    items: [
      { id: 'duplicates', label: 'Doublons', icon: 'duplicate' },
      { id: 'consistency', label: 'Cohérence', icon: 'warning' },
      { id: 'notebook', label: 'Carnet', icon: 'notebook' },
      { id: 'statistics', label: 'Statistiques', icon: 'stats' },
      { id: 'audit', label: 'Journal', icon: 'history' },
    ],
  },
  {
    label: 'Données locales',
    items: [
      { id: 'trees', label: 'Arbres', icon: 'tree' },
      { id: 'gedcom', label: 'GEDCOM', icon: 'file' },
      { id: 'backups', label: 'Sauvegardes', icon: 'backup' },
      { id: 'trash', label: 'Corbeille', icon: 'trash' },
      { id: 'profile', label: 'Profil local', icon: 'person' },
      { id: 'ai', label: 'IA locale', icon: 'chip' },
      { id: 'settings', label: 'Paramètres', icon: 'settings' },
    ],
  },
];

// Années de vie partagées par toutes les fiches (calculées depuis les événements).
const LifespanContext = createContext(new Map());

function PersonCard({ person, selected, onSelect, onKeyDown }) {
  const years = useContext(LifespanContext).get(person.id)?.label;
  return (
    <button
      className={`person-card${selected ? ' person-card--selected' : ''}`}
      onClick={() => onSelect(person.id)}
      onKeyDown={onKeyDown}
      type="button"
    >
      <span className="person-card__name">{personLabel(person)}</span>
      {years ? <span className="person-card__years">{years}</span> : null}
    </button>
  );
}

function CreatePersonForm({ onCreate, creating }) {
  const [givenNames, setGivenNames] = useState('');
  const [familyName, setFamilyName] = useState('');

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!givenNames.trim() || !familyName.trim()) return;
    onCreate({ givenNames: givenNames.trim(), familyName: familyName.trim() });
    setGivenNames('');
    setFamilyName('');
  };

  return (
    <form className="create-person-form" onSubmit={handleSubmit}>
      <label>
        <span>Prénom(s)</span>
        <input value={givenNames} onChange={(event) => setGivenNames(event.target.value)} />
      </label>
      <label>
        <span>Nom</span>
        <input value={familyName} onChange={(event) => setFamilyName(event.target.value)} />
      </label>
      <Button type="submit" size="sm" disabled={creating}>
        Ajouter une personne
      </Button>
    </form>
  );
}

function SearchPanel() {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState(null);
  const [searchError, setSearchError] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!term.trim()) return;
    setSearchError(null);
    try {
      const found = await client.search.query(term.trim());
      setResults(found);
    } catch (queryError) {
      setSearchError(queryError.message);
      setResults(null);
    }
  };

  return (
    <div className="search-panel">
      <form onSubmit={handleSubmit} className="search-panel__form">
        <label className="search-box">
          <span>Rechercher</span>
          <input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Nom, lieu, source..."
          />
        </label>
        <Button type="submit" size="sm">
          Rechercher
        </Button>
      </form>
      {searchError ? (
        <p role="alert" className="notice notice--error">
          {searchError}
        </p>
      ) : null}
      {results === null ? null : results.length === 0 ? (
        <p className="notice">Aucun résultat pour « {term} ».</p>
      ) : (
        <ul className="search-results">
          {results.map((result) => (
            <li key={`${result.entity_type}:${result.entity_id}`}>
              <Badge tone="neutral">{result.entity_type}</Badge> {result.title}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const MERGE_REASSIGNMENT_LABELS = {
  parentagesAsParent: 'lien(s) parent → enfant',
  parentagesAsChild: 'lien(s) enfant → parent',
  unionPartnerships: 'union(s)',
  eventParticipations: 'participation(s) à un événement',
  citations: 'citation(s) de source',
  notes: 'note(s)',
  media: 'média(s)',
};

function DuplicatesPanel({ onSelect, onMerged }) {
  const [pairs, setPairs] = useState(null);
  const [duplicatesError, setDuplicatesError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pendingMerge, setPendingMerge] = useState(null);

  const handleScan = async () => {
    setBusy(true);
    setDuplicatesError(null);
    try {
      setPairs(await client.search.duplicates());
    } catch (scanError) {
      setDuplicatesError(scanError.message);
    } finally {
      setBusy(false);
    }
  };

  const handlePreviewMerge = async (survivorId, duplicateId) => {
    setBusy(true);
    setDuplicatesError(null);
    try {
      const preview = await client.search.previewMerge(survivorId, duplicateId);
      setPendingMerge({ survivorId, duplicateId, preview });
    } catch (previewError) {
      setDuplicatesError(previewError.message);
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmMerge = async () => {
    const { survivorId, duplicateId } = pendingMerge;
    setBusy(true);
    setDuplicatesError(null);
    try {
      await client.search.merge(survivorId, duplicateId);
      setPairs((current) =>
        (current ?? []).filter((pair) => !pair.persons.some((person) => person.id === duplicateId)),
      );
      setPendingMerge(null);
      await onMerged?.();
    } catch (mergeError) {
      setDuplicatesError(mergeError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="search-panel">
      <div className="gedcom-panel__actions">
        <Button type="button" size="sm" onClick={handleScan} disabled={busy}>
          Analyser les doublons potentiels
        </Button>
      </div>
      {duplicatesError ? (
        <p role="alert" className="notice notice--error">
          {duplicatesError}
        </p>
      ) : null}
      {pendingMerge ? (
        <div className="notice" role="alertdialog" aria-label="Confirmer la fusion">
          <p>
            Fusionner {personLabel(pendingMerge.preview.duplicate)} dans{' '}
            {personLabel(pendingMerge.preview.survivor)} ? Cette action réattribue :
          </p>
          <ul>
            {Object.entries(pendingMerge.preview.reassignments)
              .filter(([, count]) => count > 0)
              .map(([key, count]) => (
                <li key={key}>
                  {count} {MERGE_REASSIGNMENT_LABELS[key] ?? key}
                </li>
              ))}
            {Object.values(pendingMerge.preview.reassignments).every((count) => count === 0) ? (
              <li>Aucune donnée liée à réattribuer.</li>
            ) : null}
          </ul>
          <p>
            La fiche de {personLabel(pendingMerge.preview.duplicate)} sera supprimée en douceur.
          </p>
          <Button type="button" size="sm" onClick={handleConfirmMerge} disabled={busy}>
            Confirmer la fusion
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setPendingMerge(null)}
            disabled={busy}
          >
            Annuler
          </Button>
        </div>
      ) : null}
      {pairs === null ? null : pairs.length === 0 ? (
        <p className="notice">Aucun doublon potentiel détecté.</p>
      ) : (
        <ul className="search-results">
          {pairs.map((pair) => {
            const [left, right] = pair.persons;
            return (
              <li key={`${left.id}:${right.id}`}>
                <Badge tone="danger">{pair.score}%</Badge> {personLabel(left)} —{' '}
                {personLabel(right)}
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => onSelect(left.id)}
                >
                  Voir la fiche A
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => onSelect(right.id)}
                >
                  Voir la fiche B
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handlePreviewMerge(left.id, right.id)}
                  disabled={busy}
                >
                  Fusionner (garder A)
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handlePreviewMerge(right.id, left.id)}
                  disabled={busy}
                >
                  Fusionner (garder B)
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const UNION_TYPES = ['MARRIAGE', 'CIVIL_PARTNERSHIP', 'COHABITATION', 'OTHER'];

const PARENT_ROLES = ['FATHER', 'MOTHER', 'PARENT'];

function ParentageSection({ persons, selected, onNavigate, onChange }) {
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
    setBusy(true);
    setParentageError(null);
    try {
      await client.parentages.remove(id);
      await loadParentage();
      await onChange?.();
    } catch (removeError) {
      setParentageError(removeError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <h3>Parenté de {personLabel(selected)}</h3>
      {parentageError ? (
        <p role="alert" className="notice notice--error">
          {parentageError}
        </p>
      ) : null}

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
                {role}
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
              <Badge tone="neutral">{parentage.parent_role}</Badge>{' '}
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

function FamiliesPanel({ persons, selected, onNavigate, onChange }) {
  const [unions, setUnions] = useState(null);
  const [type, setType] = useState('MARRIAGE');
  const [partnerId, setPartnerId] = useState('');
  const [familiesError, setFamiliesError] = useState(null);
  const [busy, setBusy] = useState(false);

  const otherPersons = useMemo(
    () => persons.filter((person) => person.id !== selected?.id),
    [persons, selected],
  );

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
    return <p className="notice">Sélectionnez une personne pour voir et gérer ses familles.</p>;
  }

  const handleCreate = async (event) => {
    event.preventDefault();
    if (!partnerId) return;
    setBusy(true);
    setFamiliesError(null);
    try {
      await client.unions.create({
        type,
        partnerIds: [selected.id, Number(partnerId)],
      });
      setPartnerId('');
      await loadUnions();
      await onChange?.();
    } catch (createError) {
      setFamiliesError(createError.message);
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (unionId) => {
    setBusy(true);
    setFamiliesError(null);
    try {
      await client.unions.remove(unionId);
      await loadUnions();
      await onChange?.();
    } catch (removeError) {
      setFamiliesError(removeError.message);
    } finally {
      setBusy(false);
    }
  };

  const personLabelById = (id) => {
    const person = persons.find((candidate) => candidate.id === id);
    return person ? personLabel(person) : `Personne #${id}`;
  };

  return (
    <div className="search-panel">
      <h3>Familles de {personLabel(selected)}</h3>
      {familiesError ? (
        <p role="alert" className="notice notice--error">
          {familiesError}
        </p>
      ) : null}

      <form className="create-person-form" onSubmit={handleCreate}>
        <label>
          <span>Type d’union</span>
          <select value={type} onChange={(event) => setType(event.target.value)}>
            {UNION_TYPES.map((unionType) => (
              <option key={unionType} value={unionType}>
                {unionType}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Partenaire</span>
          <select value={partnerId} onChange={(event) => setPartnerId(event.target.value)}>
            <option value="">— Choisir une personne —</option>
            {otherPersons.map((person) => (
              <option key={person.id} value={person.id}>
                {personLabel(person)}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" size="sm" disabled={busy || !partnerId}>
          Créer l’union
        </Button>
      </form>

      {unions === null ? (
        <p role="status">Chargement…</p>
      ) : unions.length === 0 ? (
        <p className="notice">Aucune union enregistrée pour cette personne.</p>
      ) : (
        <ul className="search-results">
          {unions.map((union) => (
            <li key={union.id}>
              <Badge tone="neutral">{union.type}</Badge>{' '}
              {union.partnerIds
                .filter((id) => id !== selected.id)
                .map((id) => (
                  <button
                    key={id}
                    type="button"
                    className="person-card"
                    style={{ display: 'inline', padding: 0, border: 0 }}
                    onClick={() => onNavigate(id)}
                  >
                    {personLabelById(id)}
                  </button>
                ))}
              <Button
                type="button"
                size="sm"
                variant="danger"
                onClick={() => handleRemove(union.id)}
                disabled={busy}
              >
                Dissoudre / supprimer
              </Button>
            </li>
          ))}
        </ul>
      )}

      <ParentageSection
        persons={persons}
        selected={selected}
        onNavigate={onNavigate}
        onChange={onChange}
      />
    </div>
  );
}

const EVENT_TYPES = [
  'BIRTH',
  'DEATH',
  'MARRIAGE',
  'DIVORCE',
  'BAPTISM',
  'BURIAL',
  'ADOPTION',
  'OCCUPATION',
  'RESIDENCE',
  'EMIGRATION',
  'IMMIGRATION',
  'CENSUS',
  'MILITARY',
  'GRADUATION',
  'WILL',
  'PROBATE',
  'RELIGIOUS_EVENT',
  'NATURALIZATION',
  'OTHER',
];
const DATE_PRECISIONS = ['EXACT', 'ABOUT', 'BEFORE', 'AFTER', 'BETWEEN', 'UNKNOWN'];

function EventsPanel({ selected }) {
  const [events, setEvents] = useState(null);
  const [places, setPlaces] = useState([]);
  const [type, setType] = useState('BIRTH');
  const [dateText, setDateText] = useState('');
  const [datePrecision, setDatePrecision] = useState('EXACT');
  const [placeId, setPlaceId] = useState('');
  const [newPlaceName, setNewPlaceName] = useState('');
  const [newPlaceLatitude, setNewPlaceLatitude] = useState('');
  const [newPlaceLongitude, setNewPlaceLongitude] = useState('');
  const [eventsError, setEventsError] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadEvents = useCallback(async () => {
    if (!selected) return;
    try {
      setEvents(await client.events.listForPerson(selected.id));
    } catch (loadError) {
      setEventsError(loadError.message);
    }
  }, [selected]);

  useEffect(() => {
    setEvents(null);
    loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    client.places
      .list()
      .then(setPlaces)
      .catch((loadError) => setEventsError(loadError.message));
  }, []);

  const placeLabelById = (id) => places.find((place) => place.id === id)?.name ?? `Lieu #${id}`;

  if (!selected) {
    return <p className="notice">Sélectionnez une personne pour voir et ajouter des événements.</p>;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setEventsError(null);
    try {
      let resolvedPlaceId = placeId ? Number(placeId) : null;
      if (newPlaceName.trim()) {
        const place = await client.places.create({
          name: newPlaceName.trim(),
          latitude: newPlaceLatitude.trim() ? Number(newPlaceLatitude) : undefined,
          longitude: newPlaceLongitude.trim() ? Number(newPlaceLongitude) : undefined,
        });
        resolvedPlaceId = place.id;
        setPlaces((current) => [...current, place]);
      }
      await client.events.create({
        type,
        dateText: dateText.trim() || null,
        datePrecision,
        placeId: resolvedPlaceId,
        participants: [{ personId: selected.id, role: 'PRINCIPAL' }],
      });
      setDateText('');
      setNewPlaceName('');
      setNewPlaceLatitude('');
      setNewPlaceLongitude('');
      setPlaceId('');
      await loadEvents();
    } catch (createError) {
      setEventsError(createError.message);
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (id) => {
    setBusy(true);
    setEventsError(null);
    try {
      await client.events.remove(id);
      await loadEvents();
    } catch (removeError) {
      setEventsError(removeError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="search-panel">
      <h3>Événements de {personLabel(selected)}</h3>
      {eventsError ? (
        <p role="alert" className="notice notice--error">
          {eventsError}
        </p>
      ) : null}

      <form className="create-person-form" onSubmit={handleSubmit}>
        <label>
          <span>Type</span>
          <select value={type} onChange={(event) => setType(event.target.value)}>
            {EVENT_TYPES.map((eventType) => (
              <option key={eventType} value={eventType}>
                {eventType}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Date (texte libre)</span>
          <input
            value={dateText}
            aria-describedby="event-date-reading"
            onChange={(event) => {
              setDateText(event.target.value);
              // La précision suit la saisie (« vers 1812 » → ABOUT) ; elle reste modifiable.
              if (event.target.value.trim()) setDatePrecision(precisionOf(event.target.value));
            }}
          />
        </label>
        <small id="event-date-reading" className="date-reading" aria-live="polite">
          {dateText.trim()
            ? parseGenealogyDate(dateText).valid
              ? `Lu comme : ${formatGenealogyDate(dateText)}`
              : 'Date non reconnue : elle sera conservée telle quelle.'
            : 'Ex. : 25 avril 1998, avril 1998, vers 1998, avant 1998, entre 1995 et 1998, 1998 ?'}
        </small>
        <label>
          <span>Précision de date</span>
          <select value={datePrecision} onChange={(event) => setDatePrecision(event.target.value)}>
            {DATE_PRECISIONS.map((precision) => (
              <option key={precision} value={precision}>
                {precision}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Lieu existant (optionnel)</span>
          <select value={placeId} onChange={(event) => setPlaceId(event.target.value)}>
            <option value="">— Aucun —</option>
            {places.map((place) => (
              <option key={place.id} value={place.id}>
                {place.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Ou nouveau lieu (optionnel)</span>
          <input value={newPlaceName} onChange={(event) => setNewPlaceName(event.target.value)} />
        </label>
        <label>
          <span>Latitude (optionnel)</span>
          <input
            value={newPlaceLatitude}
            onChange={(event) => setNewPlaceLatitude(event.target.value)}
            inputMode="decimal"
          />
        </label>
        <label>
          <span>Longitude (optionnel)</span>
          <input
            value={newPlaceLongitude}
            onChange={(event) => setNewPlaceLongitude(event.target.value)}
            inputMode="decimal"
          />
        </label>
        <Button type="submit" size="sm" disabled={busy}>
          Ajouter l’événement
        </Button>
      </form>

      {events === null ? (
        <p role="status">Chargement…</p>
      ) : events.length === 0 ? (
        <p className="notice">Aucun événement pour cette personne.</p>
      ) : (
        <ul className="search-results">
          {events.map((item) => (
            <li key={item.id}>
              <Badge tone="neutral">{item.type}</Badge> {item.date_text ?? '(date inconnue)'}
              {item.place_id ? ` — ${placeLabelById(item.place_id)}` : ''}
              <Button
                type="button"
                size="sm"
                variant="danger"
                onClick={() => handleRemove(item.id)}
                disabled={busy}
              >
                Supprimer
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TimelinePanel({ onNavigate }) {
  const [events, setEvents] = useState(null);
  const [timelineError, setTimelineError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    client.events
      .listAll()
      .then((list) => {
        if (!cancelled) setEvents(list);
      })
      .catch((loadError) => {
        if (!cancelled) setTimelineError(loadError.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (timelineError) {
    return (
      <p role="alert" className="notice notice--error">
        {timelineError}
      </p>
    );
  }

  if (events === null) {
    return <p role="status">Chargement…</p>;
  }

  if (events.length === 0) {
    return <p className="notice">Aucun événement enregistré.</p>;
  }

  return (
    <ol className="search-results">
      {events.map((event) => (
        <li key={event.id}>
          <Badge tone="neutral">{event.type}</Badge> {event.date_text ?? '(date inconnue)'}
          {event.place_name ? ` — ${event.place_name}` : ''}
          {event.participants.length > 0 ? (
            <span>
              {' '}
              (
              {event.participants
                .map(
                  (participant) =>
                    `${participant.personGivenNames} ${participant.personFamilyName}`,
                )
                .join(', ')}
              )
            </span>
          ) : null}
          {event.participants.map((participant) => (
            <Button
              key={participant.personId}
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => onNavigate(participant.personId)}
            >
              Voir {participant.personGivenNames}
            </Button>
          ))}
        </li>
      ))}
    </ol>
  );
}

// Carte des lieux, rendue en SVG statique (projection équirectangulaire
// simple) : aucune tuile de carte chargée depuis un service en ligne, pour
// rester strictement hors ligne sans dérogation ADR — chaque point est un
// lieu réel (latitude/longitude saisies via l'écran Événements), jamais une
// coordonnée fictive.
function MapPanel() {
  const [places, setPlaces] = useState(null);
  const [mapError, setMapError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    client.places
      .list()
      .then((list) => {
        if (!cancelled) setPlaces(list);
      })
      .catch((loadError) => {
        if (!cancelled) setMapError(loadError.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (mapError) {
    return (
      <p role="alert" className="notice notice--error">
        {mapError}
      </p>
    );
  }

  if (places === null) {
    return <p role="status">Chargement…</p>;
  }

  const located = places.filter((place) => place.latitude !== null && place.longitude !== null);
  const unlocated = places.filter((place) => place.latitude === null || place.longitude === null);

  if (places.length === 0) {
    return <p className="notice">Aucun lieu enregistré.</p>;
  }

  return (
    <div className="map-panel">
      {located.length === 0 ? (
        <p className="notice">Aucun lieu ne porte de coordonnées géographiques pour l’instant.</p>
      ) : (
        <svg
          role="img"
          aria-label="Carte des lieux enregistrés"
          viewBox="-180 -90 360 180"
          className="map-panel__svg"
        >
          <rect x="-180" y="-90" width="360" height="180" className="map-panel__ocean" />
          {located.map((place) => (
            <g key={place.id} transform={`translate(${place.longitude}, ${-place.latitude})`}>
              <circle r="2" className="map-panel__point" />
              <text x="3" y="1" className="map-panel__label">
                {place.name}
              </text>
            </g>
          ))}
        </svg>
      )}
      {unlocated.length > 0 ? (
        <div>
          <h3>Lieux sans coordonnées</h3>
          <ul className="search-results">
            {unlocated.map((place) => (
              <li key={place.id}>{place.name}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

const TIMELINE_ISSUE_LABELS = {
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
};
const SEVERITY_LABELS = { CERTAIN: 'Erreur certaine', POSSIBLE: 'Inhabituel, à vérifier' };

// Signale les incohérences réellement détectées par le moteur de graphe
// (`GenealogyGraphService#detectCycles`/`#validateTimeline`) — jamais
// corrigées ni fusionnées automatiquement, seulement portées à la
// connaissance de l'utilisateur pour validation humaine.
function ConsistencyPanel({ onNavigate, personLabelById }) {
  const [cycles, setCycles] = useState(null);
  const [timelineIssues, setTimelineIssues] = useState(null);
  const [consistencyError, setConsistencyError] = useState(null);
  const [busy, setBusy] = useState(false);

  const handleCheck = async () => {
    setBusy(true);
    setConsistencyError(null);
    try {
      const [cyclesResult, timelineResult] = await Promise.all([
        client.graph.cycles(),
        client.graph.timeline(),
      ]);
      setCycles(cyclesResult);
      setTimelineIssues(timelineResult);
    } catch (checkError) {
      setConsistencyError(checkError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="search-panel">
      <div className="gedcom-panel__actions">
        <Button type="button" size="sm" onClick={handleCheck} disabled={busy}>
          Vérifier la cohérence de l’arbre
        </Button>
      </div>
      {consistencyError ? (
        <p role="alert" className="notice notice--error">
          {consistencyError}
        </p>
      ) : null}
      {cycles !== null || timelineIssues !== null ? (
        <>
          <h3>Cycles de filiation</h3>
          {cycles.length === 0 ? (
            <p className="notice">Aucun cycle détecté.</p>
          ) : (
            <ul className="search-results">
              {cycles.map((cycle, index) => (
                <li key={index}>
                  <Badge tone="danger">Cycle</Badge>{' '}
                  {cycle.map((id) => personLabelById(id)).join(' → ')}
                </li>
              ))}
            </ul>
          )}

          <h3>Incohérences de chronologie</h3>
          {timelineIssues.length === 0 ? (
            <p className="notice">Aucune incohérence de date détectée.</p>
          ) : (
            <ul className="search-results">
              {timelineIssues.map((issue, index) => (
                <li
                  key={index}
                  className={`coherence-issue coherence-issue--${issue.severity.toLowerCase()}`}
                >
                  <span className="coherence-issue__severity">
                    {SEVERITY_LABELS[issue.severity] ?? issue.severity}
                  </span>{' '}
                  <strong>{TIMELINE_ISSUE_LABELS[issue.code] ?? issue.code}</strong> —{' '}
                  {personLabelById(issue.personId ?? issue.childId)}
                  {issue.parentId ? ` (parent : ${personLabelById(issue.parentId)})` : ''}
                  {issue.message ? (
                    <span className="coherence-issue__detail">{issue.message}</span>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => onNavigate(issue.personId ?? issue.childId)}
                  >
                    Voir la fiche
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </div>
  );
}

// Outil ponctuel de comparaison de deux personnes — s'appuie sur
// `GenealogyGraphService#findCommonAncestors`, jusque-là testé côté API mais
// jamais exposé à l'utilisateur.
function CommonAncestorsTool({ selected, persons, onNavigate }) {
  const [otherId, setOtherId] = useState('');
  const [result, setResult] = useState(null);
  const [toolError, setToolError] = useState(null);
  const [busy, setBusy] = useState(false);

  const otherPersons = persons.filter((person) => person.id !== selected.id);

  const handleCompare = async (event) => {
    event.preventDefault();
    if (!otherId) return;
    setBusy(true);
    setToolError(null);
    try {
      setResult(await client.graph.commonAncestors(selected.id, Number(otherId)));
    } catch (compareError) {
      setToolError(compareError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="detail-section">
      <h3>Ancêtres communs</h3>
      <form className="create-person-form" onSubmit={handleCompare}>
        <label>
          <span>Comparer avec</span>
          <select value={otherId} onChange={(event) => setOtherId(event.target.value)}>
            <option value="">— choisir une personne —</option>
            {otherPersons.map((person) => (
              <option key={person.id} value={person.id}>
                {personLabel(person)}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" size="sm" disabled={busy || !otherId}>
          Comparer
        </Button>
      </form>
      {toolError ? (
        <p role="alert" className="notice notice--error">
          {toolError}
        </p>
      ) : null}
      {result === null ? null : result.length === 0 ? (
        <p className="notice">Aucun ancêtre commun trouvé.</p>
      ) : (
        <ul className="search-results">
          {result.map((entry) => (
            <li key={entry.person.id}>
              {personLabel(entry.person)} (génération {entry.generationFromA} /{' '}
              {entry.generationFromB})
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => onNavigate(entry.person.id)}
              >
                Voir la fiche
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Documents (scans, PDF, photos) réellement attachés à une source précise —
// distincts des médias attachés à une personne : `MediaService#listForSource`
// existait côté moteur (testé côté API) mais n'était consommé par aucun écran.
function SourceMediaTool({ sourceId }) {
  const [items, setItems] = useState(null);
  const [mediaError, setMediaError] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadMedia = useCallback(async () => {
    try {
      setItems(await client.media.listForSource(sourceId));
    } catch (loadError) {
      setMediaError(loadError.message);
    }
  }, [sourceId]);

  useEffect(() => {
    setItems(null);
    loadMedia();
  }, [loadMedia]);

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setMediaError(null);
    try {
      const contentBase64 = await readFileAsBase64(file);
      await client.media.upload({ filename: file.name, contentBase64, sourceId });
      await loadMedia();
    } catch (uploadError) {
      setMediaError(uploadError.message);
    } finally {
      setBusy(false);
      event.target.value = '';
    }
  };

  const handleDownload = async (id) => {
    setMediaError(null);
    try {
      const { filename, blob } = await client.media.download(id);
      downloadBlob(filename, blob);
    } catch (downloadError) {
      setMediaError(downloadError.message);
    }
  };

  return (
    <div className="source-media-tool">
      {mediaError ? (
        <p role="alert" className="notice notice--error">
          {mediaError}
        </p>
      ) : null}
      <label className="gedcom-panel__file">
        <span>Ajouter un document à cette source</span>
        <input type="file" onChange={handleUpload} disabled={busy} />
      </label>
      {items === null ? (
        <p role="status">Chargement…</p>
      ) : items.length === 0 ? (
        <p className="notice">Aucun document attaché à cette source.</p>
      ) : (
        <ul className="search-results">
          {items.map((item) => (
            <li key={item.id}>
              {item.original_filename}
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => handleDownload(item.id)}
              >
                Télécharger
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Édition de l'identité étendue d'une personne — alias, nom marital, titre,
// suffixe et statut « vivant » existent côté modèle (Phase B du cahier des
// charges) mais n'avaient jusque-là aucun formulaire pour les saisir.
function IdentityTool({ selected, onUpdated }) {
  const [nickname, setNickname] = useState(selected.nickname ?? '');
  const [marriedName, setMarriedName] = useState(selected.married_name ?? '');
  const [title, setTitle] = useState(selected.title ?? '');
  const [suffix, setSuffix] = useState(selected.suffix ?? '');
  const [isLiving, setIsLiving] = useState(selected.is_living !== 0);
  const [identityError, setIdentityError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setNickname(selected.nickname ?? '');
    setMarriedName(selected.married_name ?? '');
    setTitle(selected.title ?? '');
    setSuffix(selected.suffix ?? '');
    setIsLiving(selected.is_living !== 0);
  }, [selected]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setIdentityError(null);
    try {
      await client.persons.update(selected.id, {
        nickname: nickname.trim() || null,
        marriedName: marriedName.trim() || null,
        title: title.trim() || null,
        suffix: suffix.trim() || null,
        isLiving,
      });
      await onUpdated();
    } catch (updateError) {
      setIdentityError(updateError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="detail-section create-person-form" onSubmit={handleSubmit}>
      <h3>Identité</h3>
      {identityError ? (
        <p role="alert" className="notice notice--error">
          {identityError}
        </p>
      ) : null}
      <label>
        <span>Surnom / alias</span>
        <input value={nickname} onChange={(event) => setNickname(event.target.value)} />
      </label>
      <label>
        <span>Nom marital</span>
        <input value={marriedName} onChange={(event) => setMarriedName(event.target.value)} />
      </label>
      <label>
        <span>Titre honorifique</span>
        <input value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label>
        <span>Suffixe</span>
        <input value={suffix} onChange={(event) => setSuffix(event.target.value)} />
      </label>
      <label>
        <input
          type="checkbox"
          checked={isLiving}
          onChange={(event) => setIsLiving(event.target.checked)}
        />
        <span>Personne vivante</span>
      </label>
      <Button type="submit" size="sm" disabled={busy}>
        Enregistrer
      </Button>
    </form>
  );
}

function SourcesPanel({ selected }) {
  const [citations, setCitations] = useState(null);
  const [sourcesById, setSourcesById] = useState({});
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [page, setPage] = useState('');
  const [confidence, setConfidence] = useState('MEDIUM');
  const [sourcesError, setSourcesError] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadCitations = useCallback(async () => {
    if (!selected) return;
    try {
      const list = await client.sources.listCitationsForEntity('PERSON', selected.id);
      setCitations(list);
      const missingIds = [...new Set(list.map((citation) => citation.source_id))];
      const fetched = await Promise.all(
        missingIds.map((id) => client.sources.get(id).then((source) => [id, source])),
      );
      setSourcesById(Object.fromEntries(fetched));
    } catch (loadError) {
      setSourcesError(loadError.message);
    }
  }, [selected]);

  useEffect(() => {
    setCitations(null);
    loadCitations();
  }, [loadCitations]);

  if (!selected) {
    return <p className="notice">Sélectionnez une personne pour voir et citer des sources.</p>;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setSourcesError(null);
    try {
      const source = await client.sources.create({
        title: title.trim(),
        author: author.trim() || null,
      });
      await client.sources.addCitation({
        sourceId: source.id,
        entityType: 'PERSON',
        entityId: selected.id,
        page: page.trim() || null,
        confidence,
      });
      setTitle('');
      setAuthor('');
      setPage('');
      await loadCitations();
    } catch (createError) {
      setSourcesError(createError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="search-panel">
      <h3>Sources citées pour {personLabel(selected)}</h3>
      {sourcesError ? (
        <p role="alert" className="notice notice--error">
          {sourcesError}
        </p>
      ) : null}

      <form className="create-person-form" onSubmit={handleSubmit}>
        <label>
          <span>Titre de la source</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label>
          <span>Auteur (optionnel)</span>
          <input value={author} onChange={(event) => setAuthor(event.target.value)} />
        </label>
        <label>
          <span>Page / référence (optionnel)</span>
          <input value={page} onChange={(event) => setPage(event.target.value)} />
        </label>
        <label>
          <span>Niveau de confiance</span>
          <select value={confidence} onChange={(event) => setConfidence(event.target.value)}>
            {['LOW', 'MEDIUM', 'HIGH'].map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" size="sm" disabled={busy}>
          Ajouter et citer la source
        </Button>
      </form>

      {citations === null ? (
        <p role="status">Chargement…</p>
      ) : citations.length === 0 ? (
        <p className="notice">Aucune source citée pour cette personne.</p>
      ) : (
        <ul className="search-results">
          {citations.map((citation) => (
            <li key={citation.id}>
              <Badge tone="neutral">{citation.confidence}</Badge>{' '}
              <strong>
                {sourcesById[citation.source_id]?.title ?? `Source #${citation.source_id}`}
              </strong>
              {citation.page ? ` — ${citation.page}` : ''}
              <SourceMediaTool sourceId={citation.source_id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const NOTE_CONFIDENCE_LEVELS = ['LOW', 'MEDIUM', 'HIGH'];

function AuditPanel({ selected }) {
  const [entries, setEntries] = useState(null);
  const [auditError, setAuditError] = useState(null);

  const loadAudit = useCallback(async () => {
    if (!selected) return;
    try {
      setEntries(await client.audit.listForEntity('persons', selected.id));
    } catch (loadError) {
      setAuditError(loadError.message);
    }
  }, [selected]);

  useEffect(() => {
    setEntries(null);
    loadAudit();
  }, [loadAudit]);

  if (!selected) {
    return <p className="notice">Sélectionnez une personne pour voir son journal d’audit.</p>;
  }

  return (
    <div className="search-panel">
      <h3>Journal d’audit de {personLabel(selected)}</h3>
      {auditError ? (
        <p role="alert" className="notice notice--error">
          {auditError}
        </p>
      ) : null}

      {entries === null ? (
        <p role="status">Chargement…</p>
      ) : entries.length === 0 ? (
        <p className="notice">Aucune entrée d’audit pour cette fiche.</p>
      ) : (
        <ul className="search-results">
          {entries.map((entry) => (
            <li key={entry.id}>
              <Badge tone="neutral">{entry.operation}</Badge> {entry.performed_at}
              {entry.performed_by ? ` — ${entry.performed_by}` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NotesPanel({ selected }) {
  const [notes, setNotes] = useState(null);
  const [body, setBody] = useState('');
  const [confidence, setConfidence] = useState('MEDIUM');
  const [isContradiction, setIsContradiction] = useState(false);
  const [notesError, setNotesError] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadNotes = useCallback(async () => {
    if (!selected) return;
    try {
      setNotes(await client.notes.listForEntity('PERSON', selected.id));
    } catch (loadError) {
      setNotesError(loadError.message);
    }
  }, [selected]);

  useEffect(() => {
    setNotes(null);
    loadNotes();
  }, [loadNotes]);

  if (!selected) {
    return <p className="notice">Sélectionnez une personne pour voir et ajouter des notes.</p>;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setNotesError(null);
    try {
      await client.notes.create({
        entityType: 'PERSON',
        entityId: selected.id,
        body: body.trim(),
        confidence,
        isContradiction,
      });
      setBody('');
      setIsContradiction(false);
      await loadNotes();
    } catch (createError) {
      setNotesError(createError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="search-panel">
      <h3>Notes sur {personLabel(selected)}</h3>
      {notesError ? (
        <p role="alert" className="notice notice--error">
          {notesError}
        </p>
      ) : null}

      <form className="create-person-form" onSubmit={handleSubmit}>
        <label>
          <span>Note</span>
          <input value={body} onChange={(event) => setBody(event.target.value)} />
        </label>
        <label>
          <span>Niveau de confiance</span>
          <select value={confidence} onChange={(event) => setConfidence(event.target.value)}>
            {NOTE_CONFIDENCE_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={isContradiction}
            onChange={(event) => setIsContradiction(event.target.checked)}
          />{' '}
          <span>Signale une contradiction (ne remplace aucune autre note)</span>
        </label>
        <Button type="submit" size="sm" disabled={busy}>
          Ajouter la note
        </Button>
      </form>

      {notes === null ? (
        <p role="status">Chargement…</p>
      ) : notes.length === 0 ? (
        <p className="notice">Aucune note pour cette personne.</p>
      ) : (
        <ul className="search-results">
          {notes.map((note) => (
            <li key={note.id}>
              <Badge tone="neutral">{note.confidence}</Badge>{' '}
              {note.is_contradiction ? <Badge tone="danger">Contradiction</Badge> : null}{' '}
              {note.body}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatisticsPanel() {
  const [totals, setTotals] = useState(null);
  const [statsError, setStatsError] = useState(null);

  useEffect(() => {
    client.statistics
      .totals()
      .then(setTotals)
      .catch((loadError) => setStatsError(loadError.message));
  }, []);

  return (
    <div className="search-panel">
      <h3>Statistiques locales</h3>
      {statsError ? (
        <p role="alert" className="notice notice--error">
          {statsError}
        </p>
      ) : totals === null ? (
        <p role="status">Chargement…</p>
      ) : (
        <dl>
          {Object.entries(totals.totals).map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function AiPanel() {
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState(null);
  const [aiError, setAiError] = useState(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!prompt.trim()) return;
    setBusy(true);
    setAiError(null);
    setResult(null);
    try {
      setResult(await client.ai.analyze(prompt.trim()));
    } catch (analyzeError) {
      setAiError(analyzeError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="search-panel">
      <h3>IA locale</h3>
      <p className="notice">
        Analyse via un serveur IA local compatible Ollama (aucun appel réseau distant). Si l’IA
        locale n’est pas activée ou que le serveur n’est pas démarré sur cette machine, une erreur
        explicite est renvoyée — jamais de réponse générée artificiellement en repli.
      </p>
      <form className="create-person-form" onSubmit={handleSubmit}>
        <label>
          <span>Question</span>
          <input value={prompt} onChange={(event) => setPrompt(event.target.value)} />
        </label>
        <Button type="submit" size="sm" disabled={busy}>
          Analyser
        </Button>
      </form>
      {aiError ? (
        <p role="alert" className="notice notice--error">
          {aiError}
        </p>
      ) : null}
      {result ? (
        <p className="notice" role="status">
          {result.response}
        </p>
      ) : null}
    </div>
  );
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error ?? new Error('Lecture du fichier impossible'));
    reader.readAsDataURL(file);
  });
}

function MediaPanel({ selected, persons = [] }) {
  const [items, setItems] = useState(null);
  const [appearsIn, setAppearsIn] = useState([]);
  const [openMediaId, setOpenMediaId] = useState(null);
  const [mediaError, setMediaError] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadMedia = useCallback(async () => {
    if (!selected) return;
    try {
      setItems(await client.media.listForEntity('PERSON', selected.id));
      const tagged = (await client.media.photosForPerson?.(selected.id)) ?? [];
      setAppearsIn(tagged.filter((item) => item.entity_id !== selected.id));
    } catch (loadError) {
      setMediaError(loadError.message);
    }
  }, [selected]);

  useEffect(() => {
    setItems(null);
    loadMedia();
  }, [loadMedia]);

  if (!selected) {
    return <p className="notice">Sélectionnez une personne pour voir et ajouter des médias.</p>;
  }

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setMediaError(null);
    try {
      const contentBase64 = await readFileAsBase64(file);
      await client.media.upload({
        filename: file.name,
        contentBase64,
        entityType: 'PERSON',
        entityId: selected.id,
      });
      await loadMedia();
    } catch (uploadError) {
      setMediaError(uploadError.message);
    } finally {
      setBusy(false);
      event.target.value = '';
    }
  };

  const handleDownload = async (id) => {
    setMediaError(null);
    try {
      const { filename, blob } = await client.media.download(id);
      downloadBlob(filename, blob);
    } catch (downloadError) {
      setMediaError(downloadError.message);
    }
  };

  const handleRemove = async (id) => {
    setBusy(true);
    setMediaError(null);
    try {
      await client.media.remove(id);
      await loadMedia();
    } catch (removeError) {
      setMediaError(removeError.message);
    } finally {
      setBusy(false);
    }
  };

  if (openMediaId !== null) {
    return (
      <div className="search-panel">
        <PhotoViewer
          client={client}
          mediaId={openMediaId}
          persons={persons}
          onClose={() => {
            setOpenMediaId(null);
            loadMedia();
          }}
        />
      </div>
    );
  }

  return (
    <div className="search-panel">
      <h3>Médias de {personLabel(selected)}</h3>
      {mediaError ? (
        <p role="alert" className="notice notice--error">
          {mediaError}
        </p>
      ) : null}

      <label className="gedcom-panel__file">
        <span>Ajouter un fichier</span>
        <input type="file" onChange={handleUpload} disabled={busy} />
      </label>

      {items === null ? (
        <p role="status">Chargement…</p>
      ) : items.length === 0 ? (
        <p className="notice">Aucun média pour cette personne.</p>
      ) : (
        <ul className="search-results">
          {items.map((item) => (
            <li key={item.id}>
              <Badge tone="neutral">{item.ocr_status}</Badge> {item.original_filename}
              {item.taken_date ? <span className="data-id">{item.taken_date}</span> : null}
              <Button
                type="button"
                size="sm"
                onClick={() => setOpenMediaId(item.id)}
                aria-label={`Ouvrir ${item.original_filename}`}
              >
                Ouvrir
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => handleDownload(item.id)}
              >
                Télécharger
              </Button>
              <Button
                type="button"
                size="sm"
                variant="danger"
                onClick={() => handleRemove(item.id)}
                disabled={busy}
              >
                Supprimer
              </Button>
            </li>
          ))}
        </ul>
      )}
      {appearsIn.length > 0 ? (
        <>
          <h4 className="media-panel__subtitle">Apparaît aussi sur</h4>
          <ul className="search-results">
            {appearsIn.map((item) => (
              <li key={item.id}>
                {item.original_filename}
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setOpenMediaId(item.id)}
                  aria-label={`Ouvrir ${item.original_filename}`}
                >
                  Ouvrir
                </Button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

const EXPORT_SCOPES = {
  all: 'Arbre complet',
  ancestors: 'Ancêtres de la personne de contexte',
  descendants: 'Descendants de la personne de contexte',
  paternal: 'Branche paternelle',
  maternal: 'Branche maternelle',
  person: 'Personne de contexte seule',
};

function exportOptions(scope, personId) {
  switch (scope) {
    case 'ancestors':
      return { ancestorsOf: personId };
    case 'descendants':
      return { descendantsOf: personId };
    case 'paternal':
      return { branchOf: personId, side: 'PATERNAL' };
    case 'maternal':
      return { branchOf: personId, side: 'MATERNAL' };
    case 'person':
      return { personOnly: personId };
    default:
      return {};
  }
}

function GedcomPanel({ onImported, selected }) {
  const [content, setContent] = useState('');
  const [preview, setPreview] = useState(null);
  const [report, setReport] = useState(null);
  const [gedcomError, setGedcomError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [exportFormat, setExportFormat] = useState('7');
  const [exportScope, setExportScope] = useState('all');
  const [exportSummary, setExportSummary] = useState(null);
  const [archive, setArchive] = useState(null);
  const [archiveReport, setArchiveReport] = useState(null);

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setArchiveReport(null);
    if (/\.(gdz|zip)$/i.test(file.name)) {
      // GEDZIP (GEDCOM 7 + médias) : importé tel quel, sans édition du texte.
      setArchive({ name: file.name, contentBase64: await readFileAsBase64(file) });
      setContent('');
      setPreview(null);
      setReport(null);
      return;
    }
    setArchive(null);
    setContent(await file.text());
    setPreview(null);
    setReport(null);
  };

  const handlePreview = async () => {
    setGedcomError(null);
    setBusy(true);
    try {
      setPreview(await client.gedcom.preview(content));
      setReport(null);
    } catch (previewError) {
      setGedcomError(previewError.message);
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    setGedcomError(null);
    setBusy(true);
    try {
      const result = await client.gedcom.import(content);
      setReport(result);
      if (result.imported) await onImported();
    } catch (importError) {
      setGedcomError(importError.message);
    } finally {
      setBusy(false);
    }
  };

  const handleImportArchive = async () => {
    setGedcomError(null);
    setBusy(true);
    try {
      const result = await client.gedcom.importArchive(archive.contentBase64);
      setArchiveReport(result);
      if (result.imported) {
        setArchive(null);
        await onImported();
      }
    } catch (importError) {
      setGedcomError(importError.message);
    } finally {
      setBusy(false);
    }
  };

  const handleExportArchive = async () => {
    setGedcomError(null);
    setBusy(true);
    try {
      const scope = selected ? exportScope : 'all';
      const result = await client.gedcom.exportArchive(exportOptions(scope, selected?.id));
      const bytes = Uint8Array.from(atob(result.contentBase64), (char) => char.charCodeAt(0));
      downloadBlob(
        scope === 'all' ? 'geneoapp-export.gdz' : `geneoapp-export-${scope}.gdz`,
        new Blob([bytes], { type: 'application/zip' }),
      );
      if (result.summary) setExportSummary(result.summary);
    } catch (exportError) {
      setGedcomError(exportError.message);
    } finally {
      setBusy(false);
    }
  };

  const handleExport = async () => {
    setGedcomError(null);
    setBusy(true);
    try {
      const scope = selected ? exportScope : 'all';
      const result = await client.gedcom.export({
        format: exportFormat,
        ...exportOptions(scope, selected?.id),
      });
      downloadText(
        scope === 'all'
          ? `geneoapp-export-${exportFormat}.ged`
          : `geneoapp-export-${scope}-${exportFormat}.ged`,
        result.gedcom,
      );
      if (result.summary) setExportSummary(result.summary);
    } catch (exportError) {
      setGedcomError(exportError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gedcom-panel">
      <label className="gedcom-panel__file">
        <span>Fichier GEDCOM (.ged) ou GEDZIP avec médias (.gdz, .zip)</span>
        <input type="file" accept=".ged,.gdz,.zip" onChange={handleFile} />
      </label>
      {archive ? (
        <div className="notice" role="status">
          <p>
            Archive prête : <strong>{archive.name}</strong>. Les personnes, familles et événements
            sont importés en une transaction, puis les fichiers médias rattachés.
          </p>
          <Button type="button" size="sm" onClick={handleImportArchive} disabled={busy}>
            Importer l’archive GEDZIP
          </Button>
        </div>
      ) : null}
      {archiveReport ? (
        <p className="notice" role="status">
          {archiveReport.imported
            ? `Archive importée : ${archiveReport.mapping.persons} personne(s), ${archiveReport.media.attached} média(s) rattaché(s)` +
              (archiveReport.media.missing.length
                ? `, ${archiveReport.media.missing.length} fichier(s) absent(s) de l’archive`
                : '') +
              (archiveReport.media.rejected.length
                ? `, ${archiveReport.media.rejected.length} fichier(s) refusé(s) : ${archiveReport.media.rejected.map((item) => `${item.file} (${item.reason})`).join(', ')}`
                : '') +
              '.'
            : 'Import refusé : aucune donnée écrite (rollback).'}
        </p>
      ) : null}
      <textarea
        aria-label="Contenu GEDCOM"
        value={content}
        onChange={(event) => {
          setContent(event.target.value);
          setPreview(null);
          setReport(null);
        }}
        rows={8}
      />
      <div className="gedcom-panel__actions">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={handlePreview}
          disabled={busy || !content}
        >
          Aperçu
        </Button>
        <Button type="button" size="sm" onClick={handleImport} disabled={busy || !preview?.valid}>
          Importer
        </Button>
      </div>
      {gedcomError ? (
        <p role="alert" className="notice notice--error">
          {gedcomError}
        </p>
      ) : null}
      {preview ? (
        <p className="notice" role="status">
          {preview.valid
            ? `Aperçu valide : ${preview.mapping.persons} personne(s), ${preview.mapping.unions} union(s), ${preview.mapping.events} événement(s).`
            : `GEDCOM invalide : ${preview.errors?.map((issue) => issue.message).join(', ') || 'voir le rapport'}`}
        </p>
      ) : null}
      {report ? (
        <p className="notice" role="status">
          {report.imported
            ? 'Import réussi et transactionnel.'
            : 'Import refusé : aucune donnée écrite (rollback).'}
        </p>
      ) : null}

      <div className="gedcom-panel__export">
        <label>
          <span>Format d’export</span>
          <select value={exportFormat} onChange={(event) => setExportFormat(event.target.value)}>
            <option value="7">GEDCOM 7</option>
            <option value="5.5.1">GEDCOM 5.5.1</option>
          </select>
        </label>
        <label>
          <span>Périmètre</span>
          <select value={exportScope} onChange={(event) => setExportScope(event.target.value)}>
            {Object.entries(EXPORT_SCOPES).map(([value, label]) => (
              <option key={value} value={value} disabled={value !== 'all' && !selected}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <Button type="button" size="sm" variant="secondary" onClick={handleExport} disabled={busy}>
          {exportScope === 'all' || !selected
            ? 'Exporter l’arbre complet'
            : 'Exporter le périmètre'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={handleExportArchive}
          disabled={busy}
        >
          Exporter en GEDZIP (avec médias)
        </Button>
        {selected && exportScope !== 'all' ? (
          <p className="settings-hint">Personne de contexte : {personLabel(selected)}</p>
        ) : null}
        {exportSummary ? (
          <p role="status" className="data-id">
            Exporté : {exportSummary.persons} personne(s), {exportSummary.families} famille(s)
          </p>
        ) : null}
      </div>
    </div>
  );
}

function LoginForm({ onLogin, loginError }) {
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!name.trim()) return;
    onLogin(name.trim(), pin.trim() || undefined);
  };

  return (
    <form className="create-person-form" onSubmit={handleSubmit}>
      <p className="notice">
        Les sauvegardes, la restauration, la corbeille et le profil sont des opérations sensibles :
        connectez-vous avec un profil local pour y accéder.
      </p>
      <label>
        <span>Profil local</span>
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label>
        <span>Code PIN (optionnel)</span>
        <input type="password" value={pin} onChange={(event) => setPin(event.target.value)} />
      </label>
      {loginError ? (
        <p role="alert" className="notice notice--error">
          {loginError}
        </p>
      ) : null}
      <Button type="submit" size="sm">
        Se connecter
      </Button>
    </form>
  );
}

function BackupsPanel({ session, onLogin, loginError, onLogout, section = 'backups' }) {
  const [backups, setBackups] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [passphrase, setPassphrase] = useState('');
  const [backupStatus, setBackupStatus] = useState(null);
  const [trashItems, setTrashItems] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      setBackups(await client.backups.list(session.token));
      setTrashItems(await client.trash.list());
    } catch (loadError) {
      setActionError(loadError.message);
    }
  }, [session]);

  useEffect(() => {
    if (session) loadAll();
  }, [session, loadAll]);

  if (!session) {
    return <LoginForm onLogin={onLogin} loginError={loginError} />;
  }

  const handleCreateBackup = async (kind) => {
    setBusy(true);
    setActionError(null);
    try {
      await client.backups.create({ kind }, session.token);
      await loadAll();
    } catch (createError) {
      setActionError(createError.message);
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async (backup) => {
    setBusy(true);
    setActionError(null);
    setBackupStatus(null);
    try {
      // SQLite : remplacement du fichier (effectif au redémarrage) ; JSON : immédiat.
      const kind = backup.kind === 'sqlite' ? 'sqlite' : 'logical';
      const result = await client.backups.restore(backup.filename, kind, session.token);
      setBackupStatus(
        result?.restartRequired
          ? 'Restauration préparée : redémarrez GeneoApp pour retrouver cette version.'
          : 'Sauvegarde restaurée.',
      );
      await loadAll();
    } catch (restoreError) {
      setActionError(restoreError.message);
    } finally {
      setBusy(false);
    }
  };

  const handleExportEncrypted = async (backup) => {
    setActionError(null);
    setBackupStatus(null);
    try {
      const result = await client.backups.exportEncrypted(
        backup.filename,
        passphrase,
        session.token,
      );
      const bytes = Uint8Array.from(atob(result.contentBase64), (char) => char.charCodeAt(0));
      downloadBlob(result.filename, new Blob([bytes], { type: 'application/octet-stream' }));
      setBackupStatus(
        'Copie chiffrée prête : conservez la phrase secrète, elle est indispensable.',
      );
    } catch (exportError) {
      setActionError(exportError.message);
    }
  };

  const handleImportEncrypted = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setActionError(null);
    setBackupStatus(null);
    try {
      await client.backups.importEncrypted(await readFileAsBase64(file), passphrase, session.token);
      setBackupStatus(
        'Sauvegarde chiffrée déchiffrée et ajoutée à la liste : vous pouvez la restaurer.',
      );
      await loadAll();
    } catch (importError) {
      setActionError(importError.message);
    } finally {
      setBusy(false);
      event.target.value = '';
    }
  };

  const handleTrashRestore = async (table, id) => {
    setBusy(true);
    setActionError(null);
    try {
      await client.trash.restore(table, id, session.token);
      await loadAll();
    } catch (restoreError) {
      setActionError(restoreError.message);
    } finally {
      setBusy(false);
    }
  };

  const handlePurge = async (table, id) => {
    setBusy(true);
    setActionError(null);
    try {
      await client.trash.purge(table, id, session.token);
      await loadAll();
    } catch (purgeError) {
      setActionError(purgeError.message);
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    setBusy(true);
    setActionError(null);
    try {
      await client.accounts.logout(session.token);
      onLogout();
    } catch (logoutError) {
      setActionError(logoutError.message);
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveAccount = async () => {
    setBusy(true);
    setActionError(null);
    try {
      await client.accounts.remove(session.account.id, session.token);
      onLogout();
    } catch (removeError) {
      setActionError(removeError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="backups-panel">
      {actionError ? (
        <p role="alert" className="notice notice--error">
          {actionError}
        </p>
      ) : null}

      <section className="session-banner">
        <h3>Profil connecté : {session.account.name}</h3>
        <div className="gedcom-panel__actions">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={handleLogout}
            disabled={busy}
          >
            Se déconnecter
          </Button>
        </div>
      </section>

      {section === 'profile' ? (
        <section>
          <h3>Profil local</h3>
          <dl className="profile-details">
            <div>
              <dt>Nom du profil</dt>
              <dd>{session.account.name}</dd>
            </div>
            <div>
              <dt>Protection</dt>
              <dd>{session.account.hasPin ? 'Code PIN activé' : 'Sans code PIN'}</dd>
            </div>
            <div>
              <dt>Stockage</dt>
              <dd>Local à cet appareil, aucun compte en ligne</dd>
            </div>
          </dl>
          <div className="danger-zone">
            <h4>Zone sensible</h4>
            <p className="settings-hint">
              Supprimer le profil retire l’accès aux sauvegardes et à la corbeille pour ce nom. Les
              personnes de l’arbre ne sont pas supprimées.
            </p>
            {confirming === 'account' ? (
              <div className="gedcom-panel__actions">
                <Button
                  type="button"
                  size="sm"
                  variant="danger"
                  onClick={handleRemoveAccount}
                  disabled={busy}
                >
                  Confirmer la suppression du profil
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setConfirming(null)}
                >
                  Annuler
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="danger"
                onClick={() => setConfirming('account')}
                disabled={busy}
              >
                Supprimer ce profil
              </Button>
            )}
          </div>
        </section>
      ) : null}

      {section === 'backups' ? (
        <section>
          <h3>Sauvegardes</h3>
          <p className="settings-hint">
            Sauvegardes automatiques au lancement, avant chaque import GEDCOM et avant chaque mise à
            jour de la base (10 conservées par motif). Les sauvegardes manuelles ne sont jamais
            supprimées.
          </p>
          {backupStatus ? (
            <p role="status" className="notice">
              {backupStatus}
            </p>
          ) : null}
          <fieldset className="encrypted-backup">
            <legend>Copie chiffrée (clé USB, disque externe)</legend>
            <label>
              <span>Phrase secrète (12 caractères minimum)</span>
              <input
                type="password"
                autoComplete="new-password"
                value={passphrase}
                onChange={(event) => setPassphrase(event.target.value)}
              />
            </label>
            <label className="gedcom-panel__file">
              <span>Importer une sauvegarde chiffrée (.gnapenc)</span>
              <input
                type="file"
                accept=".gnapenc"
                onChange={handleImportEncrypted}
                disabled={busy || passphrase.length < 12}
              />
            </label>
            <p className="settings-hint">
              Chiffrement AES-256-GCM. Sans la phrase secrète, la copie est illisible : elle ne peut
              pas être récupérée.
            </p>
          </fieldset>
          <div className="gedcom-panel__actions">
            <Button
              type="button"
              size="sm"
              onClick={() => handleCreateBackup('json')}
              disabled={busy}
            >
              Créer une sauvegarde (JSON)
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => handleCreateBackup('sqlite')}
              disabled={busy}
            >
              Créer une sauvegarde (SQLite)
            </Button>
          </div>
          {backups === null ? (
            <p role="status">Chargement…</p>
          ) : backups.length === 0 ? (
            <p className="notice">Aucune sauvegarde pour l’instant.</p>
          ) : (
            <ul className="search-results">
              {backups.map((backup) => (
                <li key={backup.filename}>
                  <span className="backup-row__main">
                    <strong>
                      {backup.createdAt
                        ? new Date(backup.createdAt).toLocaleString('fr-FR')
                        : backup.filename}
                    </strong>
                    <span className="data-id">
                      {backup.kind === 'sqlite' ? 'SQLite' : 'JSON'} ·{' '}
                      {backup.label?.startsWith('auto:')
                        ? `Automatique · ${backup.label.slice(5)}`
                        : (backup.label ?? 'Manuelle')}
                      {backup.sizeBytes
                        ? ` · ${Math.max(1, Math.round(backup.sizeBytes / 1024))} Ko`
                        : ''}
                    </span>
                    {backup.createdAt ? (
                      <span className="data-id backup-row__file">{backup.filename}</span>
                    ) : null}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => handleRestore(backup)}
                    disabled={busy}
                  >
                    Restaurer
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => handleExportEncrypted(backup)}
                    disabled={busy || passphrase.length < 12}
                    aria-label={`Exporter chiffrée la sauvegarde du ${backup.createdAt ? new Date(backup.createdAt).toLocaleString('fr-FR') : backup.filename}`}
                  >
                    Exporter chiffrée
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {section === 'trash' ? (
        <section>
          <h3>Corbeille</h3>
          <p className="settings-hint">
            Suppression logique : tout élément reste restaurable ici tant qu’il n’est pas purgé.
          </p>
          {trashItems === null ? (
            <p role="status">Chargement…</p>
          ) : trashItems.length === 0 ? (
            <p className="notice">La corbeille est vide.</p>
          ) : (
            <ul className="search-results">
              {trashItems.map((item) => (
                <li key={`${item.table}:${item.id}`}>
                  <Badge tone="neutral">{item.table}</Badge> {item.label}
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => handleTrashRestore(item.table, item.id)}
                    disabled={busy}
                  >
                    Restaurer
                  </Button>
                  {confirming === `${item.table}:${item.id}` ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="danger"
                        onClick={() => {
                          setConfirming(null);
                          handlePurge(item.table, item.id);
                        }}
                        disabled={busy}
                      >
                        Confirmer la purge
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => setConfirming(null)}
                      >
                        Annuler
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="danger"
                      onClick={() => setConfirming(`${item.table}:${item.id}`)}
                      disabled={busy}
                    >
                      Purger définitivement
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}

const PERSON_TABS = [
  { id: 'identity', label: 'Identité' },
  { id: 'events', label: 'Événements' },
  { id: 'sources', label: 'Sources' },
  { id: 'media', label: 'Médias' },
  { id: 'notes', label: 'Notes' },
  { id: 'history', label: 'Historique' },
];

// Fiche personne complète : un en-tête d'identité puis des onglets réutilisant
// les outils déjà branchés sur l'API locale.
function PersonSheet({ selected, relations, onUpdated, persons = [] }) {
  const [tab, setTab] = useState('identity');

  const handleTabKeyDown = (event) => {
    const index = PERSON_TABS.findIndex((item) => item.id === tab);
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = PERSON_TABS[(index + delta + PERSON_TABS.length) % PERSON_TABS.length];
    setTab(next.id);
    event.currentTarget.parentElement.querySelector(`#person-tab-${next.id}`)?.focus();
  };

  return (
    <div className="person-sheet">
      <header className="person-sheet__header">
        <span className="avatar avatar--lg" aria-hidden="true">
          <Icon name="person" />
        </span>
        <div>
          <h2 className="person-sheet__name">{personLabel(selected)}</h2>
          <p className="person-sheet__badges">
            {selected.sex ? (
              <Badge>
                {selected.sex === 'M' ? 'Homme' : selected.sex === 'F' ? 'Femme' : 'Sexe inconnu'}
              </Badge>
            ) : null}
            <Badge>{selected.is_living === 0 ? 'Décédé(e)' : 'Vivant(e)'}</Badge>
            <span className="data-id">#{selected.id}</span>
          </p>
        </div>
        <button
          type="button"
          className="icon-button person-sheet__print"
          aria-label="Imprimer la fiche ou l’enregistrer en PDF"
          title="Imprimer / PDF"
          onClick={() => window.print?.()}
        >
          <Icon name="print" />
        </button>
      </header>
      <div className="tabs" role="tablist" aria-label="Sections de la fiche">
        {PERSON_TABS.map((item) => (
          <button
            key={item.id}
            id={`person-tab-${item.id}`}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            aria-controls="person-tabpanel"
            tabIndex={tab === item.id ? 0 : -1}
            onClick={() => setTab(item.id)}
            onKeyDown={handleTabKeyDown}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div id="person-tabpanel" role="tabpanel" aria-labelledby={`person-tab-${tab}`}>
        {tab === 'identity' ? (
          <div className="person-sheet__identity">
            <div className="details-panel person-sheet__form">
              <IdentityTool selected={selected} onUpdated={onUpdated} />
            </div>
            {relations ? (
              <div className="detail-section">
                <h3>Famille proche</h3>
                <dl>
                  <div>
                    <dt>Parents</dt>
                    <dd>{relations.parents.map(personLabel).join(', ') || '—'}</dd>
                  </div>
                  <div>
                    <dt>Conjoints</dt>
                    <dd>{relations.spouses.map(personLabel).join(', ') || '—'}</dd>
                  </div>
                  <div>
                    <dt>Enfants</dt>
                    <dd>{relations.children.map(personLabel).join(', ') || '—'}</dd>
                  </div>
                  <div>
                    <dt>Fratrie</dt>
                    <dd>{relations.siblings.map(personLabel).join(', ') || '—'}</dd>
                  </div>
                </dl>
              </div>
            ) : null}
          </div>
        ) : tab === 'events' ? (
          <EventsPanel selected={selected} />
        ) : tab === 'sources' ? (
          <SourcesPanel selected={selected} />
        ) : tab === 'media' ? (
          <MediaPanel selected={selected} persons={persons} />
        ) : tab === 'notes' ? (
          <NotesPanel selected={selected} />
        ) : (
          <AuditPanel selected={selected} />
        )}
      </div>
    </div>
  );
}

// Bascule rapide Clair ↔ Sombre ; le réglage complet est dans Paramètres.
function ThemeToggle() {
  const { settings, update } = useSettings();
  const prefersDark =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const isDark = settings.theme === 'dark' || (settings.theme === 'system' && prefersDark);
  return (
    <button
      type="button"
      className="icon-button"
      aria-label={isDark ? 'Passer au thème clair' : 'Passer au thème sombre'}
      title={isDark ? 'Thème clair' : 'Thème sombre'}
      onClick={() => update({ theme: isDark ? 'light' : 'dark' })}
    >
      <Icon name={isDark ? 'sun' : 'moon'} />
    </button>
  );
}

function AppContent() {
  const { settings } = useSettings();
  const [persons, setPersons] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [relations, setRelations] = useState(null);
  const [view, setView] = useState('tree');
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [session, setSession] = useState(null);
  const [loginError, setLoginError] = useState(null);
  const [activeTree, setActiveTree] = useState(null);
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const [historyMessage, setHistoryMessage] = useState('');
  const [dataVersion, setDataVersion] = useState(0);
  const [lifespans, setLifespans] = useState(() => new Map());

  const handleLogin = async (name, pin) => {
    setLoginError(null);
    try {
      const { token, account } = await client.accounts.login(name, pin);
      setSession({ token, account });
    } catch (loginErr) {
      if (loginErr.status !== 401) {
        setLoginError(loginErr.message);
        return;
      }
      // Premier lancement local : aucun écran séparé de création de profil,
      // on crée le profil à la volée si le nom est inconnu.
      try {
        await client.accounts.create({ name, pin });
        const { token, account } = await client.accounts.login(name, pin);
        setSession({ token, account });
      } catch (createErr) {
        setLoginError(createErr.message);
      }
    }
  };

  const loadPersons = useCallback(async () => {
    try {
      const list = await client.persons.list();
      setPersons(list);
      setSelectedId((current) => current ?? list[0]?.id ?? null);
    } catch (loadError) {
      setError(loadError.message);
    }
  }, []);

  useEffect(() => {
    loadPersons();
  }, [loadPersons]);

  useEffect(() => {
    client.trees
      ?.active()
      .then(setActiveTree)
      .catch(() => setActiveTree(null));
  }, []);

  const refreshLifespans = useCallback(async () => {
    try {
      setLifespans(buildLifespans((await client.events.listAll()) ?? []));
    } catch {
      // les années de vie sont un confort d'affichage, jamais bloquantes
    }
  }, []);

  useEffect(() => {
    refreshLifespans();
    writeListeners.add(refreshLifespans);
    return () => writeListeners.delete(refreshLifespans);
  }, [refreshLifespans, dataVersion, activeTree?.id]);

  const refreshHistory = useCallback(async () => {
    try {
      const status = await client.history?.status(1);
      if (status) setHistory(status);
    } catch {
      // l'historique est une aide : son indisponibilité ne bloque rien
    }
  }, []);

  useEffect(() => {
    refreshHistory();
    writeListeners.add(refreshHistory);
    return () => writeListeners.delete(refreshHistory);
  }, [refreshHistory]);

  const applyHistory = useCallback(async (direction) => {
    try {
      const result = await client.history[direction]();
      const label = direction === 'undo' ? result.undone : result.redone;
      setHistory(result);
      if (!label) return;
      setHistoryMessage(`${direction === 'undo' ? 'Annulé' : 'Rétabli'} : ${label}`);
      // Les panneaux rechargent leurs données après un retour en arrière.
      setDataVersion((version) => version + 1);
      const list = await client.persons.list();
      setPersons(list);
      setSelectedId((current) =>
        list.some((person) => person.id === current) ? current : (list[0]?.id ?? null),
      );
    } catch (historyError) {
      setError(historyError.message);
    }
  }, []);

  // Ctrl/⌘+Z annule, Ctrl/⌘+Maj+Z ou Ctrl+Y rétablit ; dans un champ de
  // saisie, le raccourci garde son comportement natif (annuler la frappe).
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      ) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        applyHistory('undo');
      } else if ((key === 'z' && event.shiftKey) || (key === 'y' && event.ctrlKey)) {
        event.preventDefault();
        applyHistory('redo');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [applyHistory]);

  // Changer d'arbre : toute la sélection appartient à l'ancien arbre.
  const handleTreeActivated = async (tree) => {
    setActiveTree(tree);
    setSelectedId(null);
    setRelations(null);
    setSession(null);
    setPersons(await client.persons.list());
    refreshHistory();
  };

  const loadRelations = useCallback(async () => {
    if (selectedId === null) {
      setRelations(null);
      return;
    }
    try {
      setRelations(await client.graph.relations(selectedId));
    } catch (relationsError) {
      setError(relationsError.message);
    }
  }, [selectedId]);

  useEffect(() => {
    setRelations(null);
    loadRelations();
    // dataVersion : recharger aussi après Annuler/Rétablir sur la même personne.
  }, [loadRelations, dataVersion]);

  useEffect(() => {
    const shortcuts = NAV_GROUPS.flatMap((group) => group.items).filter((item) => item.shortcut);
    const handleKeyDown = (event) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      const item = shortcuts[Number(event.key) - 1];
      if (!item) return;
      event.preventDefault();
      setView(item.id);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleCreate = async (data) => {
    setCreating(true);
    setError(null);
    try {
      const person = await client.persons.create(data);
      await loadPersons();
      setSelectedId(person.id);
    } catch (createError) {
      setError(createError.message);
    } finally {
      setCreating(false);
    }
  };

  const selected = useMemo(
    () => persons?.find((person) => person.id === selectedId) ?? null,
    [persons, selectedId],
  );

  const personLabelById = (id) => {
    const person = persons?.find((candidate) => candidate.id === id);
    return person ? personLabel(person) : `Personne #${id}`;
  };

  if (persons === null) {
    return (
      <main className="startup" aria-labelledby="app-title">
        <div className="startup__card">
          <img className="startup__logo" src={appIcon} alt="" width="56" height="56" />
          <h1 id="app-title">GeneoApp</h1>
          <div className="startup__progress" aria-hidden="true">
            <span />
          </div>
          <p role="status">Chargement des données locales…</p>
        </div>
      </main>
    );
  }

  const currentView = NAV_GROUPS.flatMap((group) => group.items).find((item) => item.id === view);

  return (
    <LifespanContext.Provider value={lifespans}>
      <main className="genealogy-app" aria-labelledby="app-title">
        <aside className="sidenav" aria-label="Navigation principale">
          <div className="sidenav__brand">
            <img src={appIcon} alt="" width="32" height="32" />
            <h1 id="app-title">GeneoApp</h1>
          </div>
          <div className="sidenav__scroll">
            <div className="view-switcher" role="group" aria-label="Vues">
              {NAV_GROUPS.map((group) => (
                <div className="sidenav__group" key={group.label}>
                  <p className="sidenav__label" aria-hidden="true">
                    {group.label}
                  </p>
                  {group.items.map((item) => (
                    <button
                      key={item.id}
                      className={`sidenav__item${view === item.id ? ' is-active' : ''}`}
                      aria-current={view === item.id ? 'page' : undefined}
                      onClick={() => setView(item.id)}
                      type="button"
                    >
                      <Icon name={item.icon} />
                      <span className="sidenav__text">{item.label}</span>
                      {item.shortcut && settings.showShortcuts ? (
                        <kbd className="sidenav__kbd" aria-hidden="true">
                          {item.shortcut}
                        </kbd>
                      ) : null}
                    </button>
                  ))}
                </div>
              ))}
            </div>

            <div className="sidenav__group sidenav__persons">
              <h2 className="sidenav__label">
                Personnes · <span>{persons.length} personne(s)</span>
              </h2>
              <CreatePersonForm onCreate={handleCreate} creating={creating} />
              <nav className="person-list" aria-label="Personnes">
                {persons.length === 0 ? (
                  <p className="notice">
                    Aucune personne enregistrée. Ajoutez la première personne ci-dessus pour
                    démarrer votre arbre.
                  </p>
                ) : (
                  persons.map((person, index) => (
                    <PersonCard
                      key={person.id}
                      person={person}
                      selected={person.id === selectedId}
                      onSelect={setSelectedId}
                      onKeyDown={(event) => {
                        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
                        event.preventDefault();
                        const delta = event.key === 'ArrowDown' ? 1 : -1;
                        const nextIndex = (index + delta + persons.length) % persons.length;
                        setSelectedId(persons[nextIndex].id);
                        const buttons =
                          event.currentTarget.parentElement.querySelectorAll('.person-card');
                        buttons[nextIndex]?.focus();
                      }}
                    />
                  ))
                )}
              </nav>
            </div>
          </div>
          <div className="sidenav__footer">
            <p>
              <Icon name="chip" /> IA locale
            </p>
            <p>
              <Icon name="offline" /> Hors ligne · 100 % local
            </p>
          </div>
        </aside>

        <header className="topbar">
          <p className="topbar__crumbs">
            <button type="button" className="topbar__tree" onClick={() => setView('trees')}>
              {activeTree?.name ?? 'Arbre local'}
            </button>
            <span aria-hidden="true">›</span>
            <strong>{currentView?.label ?? 'Arbre'}</strong>
          </p>
          {selected ? (
            <p className="topbar__context">
              <Icon name="person" />
              <span>Contexte :</span>
              <strong className="person-name">{personLabel(selected)}</strong>
              {lifespans.get(selected.id) ? (
                <span className="data-id">{lifespans.get(selected.id).label}</span>
              ) : null}
              <span className="data-id">#{selected.id}</span>
            </p>
          ) : null}
          <div className="topbar__actions">
            <div className="history-controls" role="group" aria-label="Historique">
              <button
                type="button"
                className="icon-button"
                disabled={!history.canUndo}
                aria-label={history.canUndo ? `Annuler : ${history.undoLabel}` : 'Rien à annuler'}
                title={
                  history.canUndo ? `Annuler : ${history.undoLabel} (Ctrl+Z)` : 'Rien à annuler'
                }
                onClick={() => applyHistory('undo')}
              >
                <Icon name="undo" />
              </button>
              <button
                type="button"
                className="icon-button"
                disabled={!history.canRedo}
                aria-label={history.canRedo ? `Rétablir : ${history.redoLabel}` : 'Rien à rétablir'}
                title={
                  history.canRedo
                    ? `Rétablir : ${history.redoLabel} (Ctrl+Maj+Z)`
                    : 'Rien à rétablir'
                }
                onClick={() => applyHistory('redo')}
              >
                <Icon name="redo" />
              </button>
            </div>
            <p className="gds-visually-hidden" role="status" aria-live="polite">
              {historyMessage}
            </p>
            <Badge tone="success">Hors ligne</Badge>
            <ThemeToggle />
            <LanguageSwitcher />
          </div>
        </header>

        {error ? (
          <p role="alert" className="notice notice--error app-error">
            {error}
          </p>
        ) : null}

        <section className="workspace" aria-label="Espace de généalogie">
          <section className="canvas-panel" aria-label="Vue de l'arbre">
            <div key={dataVersion} className={`genealogy-canvas genealogy-canvas--${view}`}>
              {view === 'search' ? (
                <SearchPanel />
              ) : view === 'gedcom' ? (
                <GedcomPanel onImported={loadPersons} selected={selected} />
              ) : view === 'backups' || view === 'trash' || view === 'profile' ? (
                <BackupsPanel
                  section={view === 'trash' ? 'trash' : view === 'profile' ? 'profile' : 'backups'}
                  session={session}
                  onLogin={handleLogin}
                  loginError={loginError}
                  onLogout={() => setSession(null)}
                />
              ) : view === 'duplicates' ? (
                <DuplicatesPanel
                  onSelect={(id) => {
                    setSelectedId(id);
                    setView('tree');
                  }}
                  onMerged={async () => {
                    await loadPersons();
                    await loadRelations();
                  }}
                />
              ) : view === 'families' ? (
                <FamiliesPanel
                  persons={persons}
                  selected={selected}
                  onNavigate={setSelectedId}
                  onChange={loadRelations}
                />
              ) : view === 'notes' ? (
                <NotesPanel selected={selected} />
              ) : view === 'audit' ? (
                <AuditPanel selected={selected} />
              ) : view === 'media' ? (
                <MediaPanel selected={selected} persons={persons} />
              ) : view === 'sources' ? (
                <SourcesPanel selected={selected} />
              ) : view === 'events' ? (
                <EventsPanel selected={selected} />
              ) : view === 'timeline' ? (
                <TimelinePanel
                  onNavigate={(id) => {
                    setSelectedId(id);
                    setView('tree');
                  }}
                />
              ) : view === 'map' ? (
                <MapPanel />
              ) : view === 'consistency' ? (
                <ConsistencyPanel
                  personLabelById={personLabelById}
                  onNavigate={(id) => {
                    setSelectedId(id);
                    setView('tree');
                  }}
                />
              ) : view === 'notebook' ? (
                <NotebookPanel
                  client={client}
                  persons={persons}
                  onNavigate={(id) => {
                    setSelectedId(id);
                    setView('tree');
                  }}
                />
              ) : view === 'statistics' ? (
                <StatisticsPanel />
              ) : view === 'ai' ? (
                <AiPanel />
              ) : view === 'trees' ? (
                <TreesPanel client={client} onActivated={handleTreeActivated} />
              ) : view === 'settings' ? (
                <SettingsPanel />
              ) : view === 'person' && selected ? (
                <PersonSheet
                  selected={selected}
                  relations={relations}
                  onUpdated={loadPersons}
                  persons={persons}
                />
              ) : view === 'relations' ? (
                <RelationshipPanel
                  client={client}
                  persons={persons}
                  selected={selected}
                  onNavigate={setSelectedId}
                />
              ) : !selected ? (
                <div className="empty-state">
                  <img src={appIcon} alt="" width="56" height="56" />
                  <h2>Profil prêt, arbre vide</h2>
                  <p className="notice">
                    Sélectionnez ou créez une personne pour afficher son arbre.
                  </p>
                </div>
              ) : !relations ? (
                <p role="status" className="loading-line">
                  Chargement des relations…
                </p>
              ) : (
                <TreeExplorer
                  client={client}
                  lifespans={lifespans}
                  defaultMode={settings.treeMode}
                  defaultDepth={settings.treeDepth}
                  showSosa={settings.showSosa}
                  selected={selected}
                  onSelect={setSelectedId}
                  familyView={
                    <div className="tree-layout">
                      <div className="tree-row">
                        {relations.parents.map((person) => (
                          <PersonCard
                            key={person.id}
                            person={person}
                            selected={false}
                            onSelect={setSelectedId}
                          />
                        ))}
                      </div>
                      {relations.parents.length > 0 ? (
                        <div className="tree-connector" aria-hidden="true" />
                      ) : null}
                      <div className="tree-row tree-row--focus">
                        <PersonCard person={selected} selected onSelect={setSelectedId} />
                        {relations.spouses.map((person) => (
                          <PersonCard
                            key={person.id}
                            person={person}
                            selected={false}
                            onSelect={setSelectedId}
                          />
                        ))}
                      </div>
                      {relations.children.length > 0 ? (
                        <div className="tree-connector" aria-hidden="true" />
                      ) : null}
                      <div className="tree-row">
                        {relations.children.map((person) => (
                          <PersonCard
                            key={person.id}
                            person={person}
                            selected={false}
                            onSelect={setSelectedId}
                          />
                        ))}
                      </div>
                      <ul className="tree-legend" aria-label="Légende">
                        <li>
                          <span className="tree-legend__line tree-legend__line--bio" /> Biologique
                        </li>
                        <li>
                          <span className="tree-legend__line tree-legend__line--adoptive" />{' '}
                          Adoptive
                        </li>
                        <li>
                          <span className="tree-legend__line tree-legend__line--unknown" /> Inconnue
                        </li>
                      </ul>
                    </div>
                  }
                />
              )}
            </div>
          </section>

          <aside className="details-panel" aria-labelledby="person-title">
            {selected ? (
              <>
                <div className="details-panel__top">
                  <span className="avatar" aria-hidden="true">
                    <Icon name="person" />
                  </span>
                  <div>
                    <p className="eyebrow">Personne sélectionnée</p>
                    <h2 id="person-title">{personLabel(selected)}</h2>
                    <p className="data-id">
                      {lifespans.get(selected.id)?.label ?? 'Dates inconnues'} · #{selected.id}
                    </p>
                  </div>
                </div>
                <IdentityTool selected={selected} onUpdated={loadPersons} />
                {relations ? (
                  <div className="detail-section">
                    <h3>Relations</h3>
                    <dl>
                      <div>
                        <dt>Parents</dt>
                        <dd>{relations.parents.length}</dd>
                      </div>
                      <div>
                        <dt>Enfants</dt>
                        <dd>{relations.children.length}</dd>
                      </div>
                      <div>
                        <dt>Fratrie</dt>
                        <dd>{relations.siblings.length}</dd>
                      </div>
                      <div>
                        <dt>Conjoints</dt>
                        <dd>{relations.spouses.length}</dd>
                      </div>
                    </dl>
                  </div>
                ) : null}
                {persons.length > 1 ? (
                  <CommonAncestorsTool
                    selected={selected}
                    persons={persons}
                    onNavigate={setSelectedId}
                  />
                ) : null}
              </>
            ) : (
              <p className="notice">Aucune personne sélectionnée.</p>
            )}
          </aside>
        </section>
      </main>
    </LifespanContext.Provider>
  );
}

function App() {
  return (
    <SettingsProvider>
      <AppContent />
    </SettingsProvider>
  );
}

export default App;
