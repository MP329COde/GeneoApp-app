import { useState } from 'react';
import { Button } from '../design-system/index.js';

const BRANCH_LABELS = { PATERNAL: 'paternelle', MATERNAL: 'maternelle' };
const STEP_LABELS = { PARENT: 'parent', CHILD: 'enfant', SPOUSE: 'conjoint(e)' };

function nameOf(persons, id) {
  const person = persons.find((candidate) => candidate.id === id);
  return person ? `${person.given_names} ${person.family_name}` : `Personne #${id}`;
}

// Calculateur de parenté : chemin relationnel, libellé, branche et ancêtres
// communs, calculés par le moteur généalogique (jamais côté React).
export function RelationshipPanel({ client, persons, selected, onNavigate }) {
  const [personA, setPersonA] = useState(selected ? String(selected.id) : '');
  const [personB, setPersonB] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!personA || !personB) return;
    setPending(true);
    setError(null);
    try {
      const [relationship, common] = await Promise.all([
        client.graph.relationship(Number(personA), Number(personB)),
        client.graph.commonAncestors(Number(personA), Number(personB)),
      ]);
      setResult({ relationship, common });
    } catch (calcError) {
      setError(calcError.message);
      setResult(null);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="search-panel">
      <h3>Calcul de parenté</h3>
      <form onSubmit={handleSubmit}>
        <label>
          <span>Première personne</span>
          <select value={personA} onChange={(event) => setPersonA(event.target.value)}>
            <option value="">— choisir —</option>
            {persons.map((person) => (
              <option key={person.id} value={person.id}>
                {person.given_names} {person.family_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Seconde personne</span>
          <select value={personB} onChange={(event) => setPersonB(event.target.value)}>
            <option value="">— choisir —</option>
            {persons.map((person) => (
              <option key={person.id} value={person.id}>
                {person.given_names} {person.family_name}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" disabled={pending || !personA || !personB}>
          Calculer la parenté
        </Button>
      </form>

      {error ? (
        <p role="alert" className="notice notice--error">
          {error}
        </p>
      ) : null}

      {result ? (
        <section aria-live="polite" className="relationship-result">
          {result.relationship.path.length === 0 ? (
            <p className="notice">Aucun lien trouvé entre ces deux personnes dans cet arbre.</p>
          ) : (
            <>
              <p className="relationship-result__label">
                <strong className="person-name">{nameOf(persons, Number(personB))}</strong> est{' '}
                <strong>{result.relationship.label ?? 'apparenté(e)'}</strong> de{' '}
                <strong className="person-name">{nameOf(persons, Number(personA))}</strong>.
              </p>
              <p className="data-id">
                Distance : {result.relationship.distance}
                {result.relationship.branch
                  ? ` · branche ${BRANCH_LABELS[result.relationship.branch] ?? 'indéterminée'}`
                  : ''}
              </p>
              <h4>Chemin</h4>
              <ol className="relationship-path">
                {result.relationship.path.map((step, index) => (
                  <li key={`${step.personId}-${index}`}>
                    {index > 0 ? (
                      <span className="relationship-path__via">
                        {STEP_LABELS[step.via] ?? step.via}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => onNavigate(step.personId)}
                    >
                      {nameOf(persons, step.personId)}
                    </button>
                  </li>
                ))}
              </ol>
            </>
          )}
          <h4>Ancêtres communs</h4>
          {result.common.length === 0 ? (
            <p className="notice">Aucun ancêtre commun enregistré.</p>
          ) : (
            <ul className="search-results">
              {result.common.map((item) => (
                <li key={item.person.id}>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => onNavigate(item.person.id)}
                  >
                    {item.person.given_names} {item.person.family_name}
                  </button>
                  <span className="data-id">
                    génération {item.generationFromA} / {item.generationFromB}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
