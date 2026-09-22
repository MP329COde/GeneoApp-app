import { useMemo, useState } from 'react';
import { Badge, Button, LanguageSwitcher } from './design-system/index.js';
import './App.css';

const PEOPLE = [
  {
    id: 1,
    name: 'Jean Dupont',
    years: '1872 – 1948',
    role: 'Personne centrale',
    parents: [2, 3],
    children: [4, 5],
    spouses: [6],
  },
  {
    id: 2,
    name: 'Louis Dupont',
    years: '1840 – 1911',
    role: 'Père',
    parents: [],
    children: [1],
    spouses: [],
  },
  {
    id: 3,
    name: 'Marie Martin',
    years: '1845 – 1920',
    role: 'Mère',
    parents: [],
    children: [1],
    spouses: [],
  },
  {
    id: 4,
    name: 'Paul Dupont',
    years: '1900 – 1978',
    role: 'Fils',
    parents: [1],
    children: [],
    spouses: [],
  },
  {
    id: 5,
    name: 'Sophie Dupont',
    years: '1904 – 1991',
    role: 'Fille',
    parents: [1],
    children: [],
    spouses: [],
  },
  {
    id: 6,
    name: 'Claire Bernard',
    years: '1876 – 1952',
    role: 'Conjointe',
    parents: [],
    children: [],
    spouses: [1],
  },
];

function findPerson(id) {
  return PEOPLE.find((person) => person.id === id);
}

function PersonCard({ person, selected, onSelect }) {
  return (
    <button
      className={`person-card${selected ? ' person-card--selected' : ''}`}
      onClick={() => onSelect(person.id)}
      type="button"
    >
      <span className="person-card__name">{person.name}</span>
      <span className="person-card__years">{person.years}</span>
      <span className="person-card__role">{person.role}</span>
    </button>
  );
}

function App() {
  const [selectedId, setSelectedId] = useState(1);
  const [view, setView] = useState('tree');
  const selected = findPerson(selectedId);
  const relations = useMemo(
    () => ({
      parents: selected.parents.map(findPerson),
      children: selected.children.map(findPerson),
      spouses: selected.spouses.map(findPerson),
    }),
    [selected],
  );

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

      <section className="workspace" aria-label="Espace de généalogie">
        <aside className="sidebar">
          <div className="sidebar__heading">
            <div>
              <p className="eyebrow">Arbre actif</p>
              <h2>Famille Dupont</h2>
            </div>
            <Button size="sm" variant="secondary" aria-label="Ajouter une personne">
              +
            </Button>
          </div>
          <label className="search-box">
            <span>Rechercher</span>
            <input placeholder="Nom, lieu, source..." />
          </label>
          <nav className="person-list" aria-label="Personnes récentes">
            {PEOPLE.slice(0, 5).map((person) => (
              <PersonCard
                key={person.id}
                person={person}
                selected={person.id === selectedId}
                onSelect={setSelectedId}
              />
            ))}
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
                className={view === 'family' ? 'is-active' : ''}
                onClick={() => setView('family')}
                type="button"
              >
                Famille
              </button>
              <button
                className={view === 'timeline' ? 'is-active' : ''}
                onClick={() => setView('timeline')}
                type="button"
              >
                Chronologie
              </button>
            </div>
            <div className="canvas-tools">
              <button type="button" aria-label="Réduire le zoom">
                −
              </button>
              <span>100%</span>
              <button type="button" aria-label="Augmenter le zoom">
                +
              </button>
            </div>
          </div>
          <div className={`genealogy-canvas genealogy-canvas--${view}`}>
            {view === 'timeline' ? (
              <div className="timeline">
                <span className="timeline__line" />
                {[
                  '1872 Naissance à Nantes',
                  '1898 Mariage avec Claire Bernard',
                  '1900 Naissance de Paul',
                  '1948 Décès à Paris',
                ].map((event) => (
                  <div className="timeline__event" key={event}>
                    {event}
                  </div>
                ))}
              </div>
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
          <div className="details-panel__top">
            <span className="avatar">{selected.name.charAt(0)}</span>
            <div>
              <p className="eyebrow">Fiche personne</p>
              <h2 id="person-title">{selected.name}</h2>
              <p>{selected.years}</p>
            </div>
          </div>
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
                <dt>Conjoints</dt>
                <dd>{relations.spouses.length}</dd>
              </div>
            </dl>
          </div>
          <div className="detail-section">
            <h3>Éléments à vérifier</h3>
            <p className="notice">2 sources attendent une confirmation.</p>
            <Button size="sm" variant="secondary">
              Ouvrir le carnet
            </Button>
          </div>
        </aside>
      </section>
    </main>
  );
}

export default App;
