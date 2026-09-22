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

function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
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
            </div>
          </div>
          <div className={`genealogy-canvas genealogy-canvas--${view}`}>
            {view === 'search' ? (
              <SearchPanel />
            ) : view === 'gedcom' ? (
              <GedcomPanel onImported={loadPersons} />
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
