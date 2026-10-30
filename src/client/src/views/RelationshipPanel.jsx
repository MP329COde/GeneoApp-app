import { useState } from 'react';
import { Button, useTranslation } from '../design-system/index.js';

// La branche et le type de lien sont des valeurs d'énumération renvoyées par
// le moteur généalogique : ces tables en donnent la formulation dans chaque
// langue.
const BRANCH_KEYS = {
  PATERNAL: 'relations.branch.paternal',
  MATERNAL: 'relations.branch.maternal',
};
const STEP_KEYS = {
  PARENT: 'relations.step.parent',
  CHILD: 'relations.step.child',
  SPOUSE: 'relations.step.spouse',
};

function nameOf(persons, id, unknownLabel) {
  const person = persons.find((candidate) => candidate.id === id);
  return person ? `${person.given_names} ${person.family_name}` : unknownLabel;
}

// Calculateur de parenté : chemin relationnel, libellé, branche et ancêtres
// communs, calculés par le moteur généalogique (jamais côté React).
export function RelationshipPanel({ client, persons, selected, onNavigate }) {
  const { t } = useTranslation();
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

  const unknown = (id) => t('relations.unknownPerson', { id });

  return (
    <div className="search-panel">
      <h3>{t('relations.title')}</h3>
      <form onSubmit={handleSubmit}>
        <label>
          <span>{t('relations.firstPerson')}</span>
          <select value={personA} onChange={(event) => setPersonA(event.target.value)}>
            <option value="">{t('relations.choose')}</option>
            {persons.map((person) => (
              <option key={person.id} value={person.id}>
                {person.given_names} {person.family_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t('relations.secondPerson')}</span>
          <select value={personB} onChange={(event) => setPersonB(event.target.value)}>
            <option value="">{t('relations.choose')}</option>
            {persons.map((person) => (
              <option key={person.id} value={person.id}>
                {person.given_names} {person.family_name}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" disabled={pending || !personA || !personB}>
          {t('relations.compute')}
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
            <p className="notice">{t('relations.noLink')}</p>
          ) : (
            <>
              <p className="relationship-result__label">
                <strong className="person-name">
                  {nameOf(persons, Number(personB), unknown(Number(personB)))}
                </strong>{' '}
                {t('relations.isRelatedTo')}{' '}
                <strong>{result.relationship.label ?? t('relations.related')}</strong>{' '}
                {t('relations.of')}{' '}
                <strong className="person-name">
                  {nameOf(persons, Number(personA), unknown(Number(personA)))}
                </strong>
                .
              </p>
              <p className="data-id">
                {t('relations.distance', { count: result.relationship.distance })}
                {result.relationship.branch
                  ? ` · ${t('relations.branch', {
                      branch: t(
                        BRANCH_KEYS[result.relationship.branch] ?? 'relations.branch.unknown',
                      ),
                    })}`
                  : ''}
              </p>
              <p className="data-id">
                {t('relations.bond', 'Nature du lien')} :{' '}
                {t(`relations.bond.${result.relationship.bond}`, result.relationship.bond ?? '—')}
              </p>
              {result.relationship.consanguinity ? (
                <p className="data-id">
                  {t('relations.consanguinity', 'Lien de sang')} :{' '}
                  {result.relationship.consanguinity.label}
                </p>
              ) : null}
              {result.relationship.relationships?.length > 1 ? (
                <>
                  <h4>{t('relations.multiple', 'Relations multiples')}</h4>
                  <ul className="search-results">
                    {result.relationship.relationships.map((item) => (
                      <li key={`${item.relationship}-${item.label}-${item.bond}`}>
                        {item.label ?? t('relations.related')} (
                        {t(`relations.bond.${item.bond}`, item.bond ?? '—')})
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
              <h4>{t('relations.path')}</h4>
              <ol className="relationship-path">
                {result.relationship.path.map((step, index) => (
                  <li key={`${step.personId}-${index}`}>
                    {index > 0 ? (
                      <span className="relationship-path__via">
                        {t(STEP_KEYS[step.via] ?? 'relations.step.unknown', { via: step.via })}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => onNavigate(step.personId)}
                    >
                      {nameOf(persons, step.personId, unknown(step.personId))}
                    </button>
                  </li>
                ))}
              </ol>
            </>
          )}
          <h4>{t('relations.commonAncestors')}</h4>
          {result.common.length === 0 ? (
            <p className="notice">{t('relations.noCommonAncestor')}</p>
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
                    {t('relations.generation', {
                      fromA: item.generationFromA,
                      fromB: item.generationFromB,
                    })}
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
