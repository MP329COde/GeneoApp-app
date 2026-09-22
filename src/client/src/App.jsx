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

function App() {
  const [persons, setPersons] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [relations, setRelations] = useState(null);
  const [view, setView] = useState('tree');
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);

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
    if (selectedId === null) {
      setRelations(null);
      return;
    }
    let cancelled = false;
    client.graph
      .relations(selectedId)
      .then((data) => {
        if (!cancelled) setRelations(data);
      })
      .catch((relationsError) => {
        if (!cancelled) setError(relationsError.message);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

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
            </div>
          </div>
          <div className={`genealogy-canvas genealogy-canvas--${view}`}>
            {!selected ? (
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
