import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, LanguageSwitcher } from './design-system/index.js';
import { createGeneoAppClient } from './api/geneoapp-client.js';
import './App.css';

const client = createGeneoAppClient();

function personLabel(person) {
  return `${person.given_names} ${person.family_name}`;
}

function PersonCard({ person, selected, onSelect }) {
  return (
    <button
      className={`person-card${selected ? ' person-card--selected' : ''}`}
      onClick={() => onSelect(person.id)}
      type="button"
    >
      <span className="person-card__name">{personLabel(person)}</span>
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

function DuplicatesPanel({ onSelect }) {
  const [pairs, setPairs] = useState(null);
  const [duplicatesError, setDuplicatesError] = useState(null);
  const [busy, setBusy] = useState(false);

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
        const place = await client.places.create({ name: newPlaceName.trim() });
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
          <input value={dateText} onChange={(event) => setDateText(event.target.value)} />
        </label>
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

const RESEARCH_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE', 'ABANDONED'];
const RESEARCH_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'];

function NotebookPanel({ persons, onNavigate }) {
  const [entries, setEntries] = useState(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [status, setStatus] = useState('TODO');
  const [priority, setPriority] = useState('MEDIUM');
  const [personId, setPersonId] = useState('');
  const [notebookError, setNotebookError] = useState(null);
  const [busy, setBusy] = useState(false);

  const personLabelById = (id) => {
    const person = persons.find((candidate) => candidate.id === id);
    return person ? personLabel(person) : `Personne #${id}`;
  };

  const loadEntries = useCallback(async () => {
    try {
      setEntries(await client.research.list());
    } catch (loadError) {
      setNotebookError(loadError.message);
    }
  }, []);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setBusy(true);
    setNotebookError(null);
    try {
      await client.research.create({
        title: title.trim(),
        content: content.trim(),
        status,
        priority,
        personId: personId ? Number(personId) : null,
      });
      setTitle('');
      setContent('');
      setPersonId('');
      await loadEntries();
    } catch (createError) {
      setNotebookError(createError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="search-panel">
      <h3>Carnet de recherche</h3>
      {notebookError ? (
        <p role="alert" className="notice notice--error">
          {notebookError}
        </p>
      ) : null}

      <form className="create-person-form" onSubmit={handleSubmit}>
        <label>
          <span>Titre</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label>
          <span>Note</span>
          <input value={content} onChange={(event) => setContent(event.target.value)} />
        </label>
        <label>
          <span>Statut</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            {RESEARCH_STATUSES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Priorité</span>
          <select value={priority} onChange={(event) => setPriority(event.target.value)}>
            {RESEARCH_PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Personne liée (optionnel)</span>
          <select value={personId} onChange={(event) => setPersonId(event.target.value)}>
            <option value="">— Aucune —</option>
            {persons.map((person) => (
              <option key={person.id} value={person.id}>
                {personLabel(person)}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" size="sm" disabled={busy}>
          Ajouter une piste de recherche
        </Button>
      </form>

      {entries === null ? (
        <p role="status">Chargement…</p>
      ) : entries.length === 0 ? (
        <p className="notice">Aucune piste de recherche pour l’instant.</p>
      ) : (
        <ul className="search-results">
          {entries.map((entry) => (
            <li key={entry.id}>
              <Badge tone="neutral">{entry.status}</Badge>{' '}
              <Badge tone="neutral">{entry.priority}</Badge> <strong>{entry.title}</strong> —{' '}
              {entry.content}
              {entry.person_id ? (
                <>
                  {' '}
                  (
                  <button
                    type="button"
                    className="person-card"
                    style={{ display: 'inline', padding: 0, border: 0 }}
                    onClick={() => onNavigate(entry.person_id)}
                  >
                    {personLabelById(entry.person_id)}
                  </button>
                  )
                </>
              ) : null}
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

function MediaPanel({ selected }) {
  const [items, setItems] = useState(null);
  const [mediaError, setMediaError] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadMedia = useCallback(async () => {
    if (!selected) return;
    try {
      setItems(await client.media.listForEntity('PERSON', selected.id));
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
    </div>
  );
}

function GedcomPanel({ onImported }) {
  const [content, setContent] = useState('');
  const [preview, setPreview] = useState(null);
  const [report, setReport] = useState(null);
  const [gedcomError, setGedcomError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [exportFormat, setExportFormat] = useState('7');

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
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

  const handleExport = async () => {
    setGedcomError(null);
    setBusy(true);
    try {
      const result = await client.gedcom.export({ format: exportFormat });
      downloadText(`geneoapp-export-${exportFormat}.ged`, result.gedcom);
    } catch (exportError) {
      setGedcomError(exportError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gedcom-panel">
      <label className="gedcom-panel__file">
        <span>Fichier GEDCOM (.ged)</span>
        <input type="file" accept=".ged" onChange={handleFile} />
      </label>
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
        <Button type="button" size="sm" variant="secondary" onClick={handleExport} disabled={busy}>
          Exporter l’arbre complet
        </Button>
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
        Les sauvegardes, la restauration et la corbeille sont des opérations sensibles :
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

function BackupsPanel({ session, onLogin, loginError }) {
  const [backups, setBackups] = useState(null);
  const [trashItems, setTrashItems] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      setBackups(await client.backups.list());
      setTrashItems(await client.trash.list());
    } catch (loadError) {
      setActionError(loadError.message);
    }
  }, []);

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

  const handleRestore = async (filename) => {
    setBusy(true);
    setActionError(null);
    try {
      await client.backups.restore(filename, 'logical', session.token);
      await loadAll();
    } catch (restoreError) {
      setActionError(restoreError.message);
    } finally {
      setBusy(false);
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

  return (
    <div className="backups-panel">
      {actionError ? (
        <p role="alert" className="notice notice--error">
          {actionError}
        </p>
      ) : null}

      <section>
        <h3>Sauvegardes</h3>
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
                {backup.filename}
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => handleRestore(backup.filename)}
                  disabled={busy}
                >
                  Restaurer
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3>Corbeille</h3>
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
                <Button
                  type="button"
                  size="sm"
                  variant="danger"
                  onClick={() => handlePurge(item.table, item.id)}
                  disabled={busy}
                >
                  Purger définitivement
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function App() {
  const [persons, setPersons] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [relations, setRelations] = useState(null);
  const [view, setView] = useState('tree');
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [session, setSession] = useState(null);
  const [loginError, setLoginError] = useState(null);

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
  }, [loadRelations]);

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

  if (persons === null) {
    return (
      <main className="genealogy-app" aria-labelledby="app-title">
        <h1 id="app-title">GeneoApp</h1>
        <p role="status">Chargement des données locales…</p>
      </main>
    );
  }

  return (
    <main className="genealogy-app" aria-labelledby="app-title">
      <header className="app-header">
        <div>
          <p className="app-kicker">Recherche familiale locale</p>
          <h1 id="app-title">GeneoApp</h1>
        </div>
        <div className="app-header__actions">
          <Badge tone="success">Hors ligne</Badge>
          <LanguageSwitcher />
        </div>
      </header>

      {error ? (
        <p role="alert" className="notice notice--error">
          {error}
        </p>
      ) : null}

      <section className="workspace" aria-label="Espace de généalogie">
        <aside className="sidebar">
          <div className="sidebar__heading">
            <div>
              <p className="eyebrow">Arbre actif</p>
              <h2>{persons.length} personne(s)</h2>
            </div>
          </div>
          <CreatePersonForm onCreate={handleCreate} creating={creating} />
          <nav className="person-list" aria-label="Personnes">
            {persons.length === 0 ? (
              <p className="notice">
                Aucune personne enregistrée. Ajoutez la première personne ci-dessus pour démarrer
                votre arbre.
              </p>
            ) : (
              persons.map((person) => (
                <PersonCard
                  key={person.id}
                  person={person}
                  selected={person.id === selectedId}
                  onSelect={setSelectedId}
                />
              ))
            )}
          </nav>
        </aside>

        <section className="canvas-panel" aria-label="Vue de l'arbre">
          <div className="canvas-toolbar">
            <div className="view-switcher" role="group" aria-label="Vues">
              <button
                className={view === 'tree' ? 'is-active' : ''}
                onClick={() => setView('tree')}
                type="button"
              >
                Arbre
              </button>
              <button
                className={view === 'relations' ? 'is-active' : ''}
                onClick={() => setView('relations')}
                type="button"
              >
                Relations
              </button>
              <button
                className={view === 'search' ? 'is-active' : ''}
                onClick={() => setView('search')}
                type="button"
              >
                Recherche
              </button>
              <button
                className={view === 'gedcom' ? 'is-active' : ''}
                onClick={() => setView('gedcom')}
                type="button"
              >
                GEDCOM
              </button>
              <button
                className={view === 'backups' ? 'is-active' : ''}
                onClick={() => setView('backups')}
                type="button"
              >
                Sauvegardes
              </button>
              <button
                className={view === 'duplicates' ? 'is-active' : ''}
                onClick={() => setView('duplicates')}
                type="button"
              >
                Doublons
              </button>
              <button
                className={view === 'families' ? 'is-active' : ''}
                onClick={() => setView('families')}
                type="button"
              >
                Familles
              </button>
              <button
                className={view === 'notes' ? 'is-active' : ''}
                onClick={() => setView('notes')}
                type="button"
              >
                Notes
              </button>
              <button
                className={view === 'audit' ? 'is-active' : ''}
                onClick={() => setView('audit')}
                type="button"
              >
                Journal
              </button>
              <button
                className={view === 'media' ? 'is-active' : ''}
                onClick={() => setView('media')}
                type="button"
              >
                Médias
              </button>
              <button
                className={view === 'sources' ? 'is-active' : ''}
                onClick={() => setView('sources')}
                type="button"
              >
                Sources
              </button>
              <button
                className={view === 'events' ? 'is-active' : ''}
                onClick={() => setView('events')}
                type="button"
              >
                Événements
              </button>
              <button
                className={view === 'notebook' ? 'is-active' : ''}
                onClick={() => setView('notebook')}
                type="button"
              >
                Carnet
              </button>
              <button
                className={view === 'statistics' ? 'is-active' : ''}
                onClick={() => setView('statistics')}
                type="button"
              >
                Statistiques
              </button>
              <button
                className={view === 'ai' ? 'is-active' : ''}
                onClick={() => setView('ai')}
                type="button"
              >
                IA locale
              </button>
            </div>
          </div>
          <div className={`genealogy-canvas genealogy-canvas--${view}`}>
            {view === 'search' ? (
              <SearchPanel />
            ) : view === 'gedcom' ? (
              <GedcomPanel onImported={loadPersons} />
            ) : view === 'backups' ? (
              <BackupsPanel session={session} onLogin={handleLogin} loginError={loginError} />
            ) : view === 'duplicates' ? (
              <DuplicatesPanel
                onSelect={(id) => {
                  setSelectedId(id);
                  setView('tree');
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
              <MediaPanel selected={selected} />
            ) : view === 'sources' ? (
              <SourcesPanel selected={selected} />
            ) : view === 'events' ? (
              <EventsPanel selected={selected} />
            ) : view === 'notebook' ? (
              <NotebookPanel
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
            ) : !selected ? (
              <p className="notice">Sélectionnez ou créez une personne pour afficher son arbre.</p>
            ) : !relations ? (
              <p role="status">Chargement des relations…</p>
            ) : (
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
                <div className="tree-connector" aria-hidden="true" />
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
                <div className="tree-connector" aria-hidden="true" />
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
              </div>
            )}
          </div>
        </section>

        <aside className="details-panel" aria-labelledby="person-title">
          {selected ? (
            <>
              <div className="details-panel__top">
                <span className="avatar">{selected.given_names.charAt(0)}</span>
                <div>
                  <p className="eyebrow">Fiche personne</p>
                  <h2 id="person-title">{personLabel(selected)}</h2>
                </div>
              </div>
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
            </>
          ) : (
            <p className="notice">Aucune personne sélectionnée.</p>
          )}
        </aside>
      </section>
    </main>
  );
}

export default App;
