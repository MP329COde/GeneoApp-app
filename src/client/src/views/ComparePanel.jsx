import { useEffect, useState } from 'react';
import { Button } from '../design-system/index.js';
import {
  certainOrder,
  formatGenealogyDate,
  parseGenealogyDate,
} from '../../../db/src/dates/genealogy-date.js';

function personName(person) {
  return `${person.given_names} ${person.family_name}`;
}

const SEX = { M: 'Homme', F: 'Femme', U: 'Inconnu' };

function firstDate(events, personId, types) {
  const found = events
    .filter(
      (event) =>
        types.includes(event.type) &&
        event.participants?.some((p) => p.personId === personId && p.role === 'PRINCIPAL'),
    )
    .map((event) => ({
      parsed: parseGenealogyDate(event.date_text ?? ''),
      place: event.place_name,
    }))
    .find((item) => item.parsed.valid);
  return found ?? null;
}

const normalize = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

function compareText(a, b) {
  if (!a && !b) return 'empty';
  if (!a || !b) return 'partial';
  return normalize(a) === normalize(b) ? 'same' : 'different';
}

function compareDates(a, b) {
  if (!a && !b) return 'empty';
  if (!a || !b) return 'partial';
  if (a.parsed.original.trim() === b.parsed.original.trim()) return 'same';
  // Dates différentes mais compatibles (« vers 1760 » et « 1761 ») : pas une contradiction.
  return certainOrder(a.parsed, b.parsed) === 'unknown' ? 'compatible' : 'different';
}

function compareLists(a, b) {
  if (a.length === 0 && b.length === 0) return 'empty';
  if (a.length === 0 || b.length === 0) return 'partial';
  const left = new Set(a.map(normalize));
  return b.some((item) => left.has(normalize(item))) ? 'same' : 'different';
}

const VERDICTS = {
  same: 'Identique',
  compatible: 'Compatible',
  different: 'Différent',
  partial: 'Un seul renseigné',
  empty: '—',
};

async function loadSide(client, person, events) {
  const relations = await client.graph.relations(person.id);
  return {
    person,
    relations,
    birth: firstDate(events, person.id, ['BIRTH', 'BAPTISM']),
    death: firstDate(events, person.id, ['DEATH', 'BURIAL']),
  };
}

// Comparaison de deux personnes : utile avant une fusion de doublons ou pour
// départager deux homonymes. Ne modifie rien.
export function ComparePanel({ client, persons, selected, onOpenDuplicates, initialRightId }) {
  const [leftId, setLeftId] = useState(selected ? String(selected.id) : '');
  const [rightId, setRightId] = useState(initialRightId ? String(initialRightId) : '');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!leftId || !rightId) {
      setResult(null);
      return undefined;
    }
    let cancelled = false;
    setError(null);
    (async () => {
      const events = (await client.events.listAll()) ?? [];
      const find = (id) => persons.find((person) => person.id === Number(id));
      const [left, right] = await Promise.all([
        loadSide(client, find(leftId), events),
        loadSide(client, find(rightId), events),
      ]);
      if (!cancelled) setResult({ left, right });
    })().catch((loadError) => !cancelled && setError(loadError.message));
    return () => {
      cancelled = true;
    };
  }, [client, persons, leftId, rightId]);

  const names = (list) => list.map(personName);
  const rows = result
    ? [
        ['Prénom(s)', result.left.person.given_names, result.right.person.given_names, compareText],
        ['Nom', result.left.person.family_name, result.right.person.family_name, compareText],
        ['Sexe', SEX[result.left.person.sex], SEX[result.right.person.sex], compareText],
        [
          'Naissance',
          result.left.birth,
          result.right.birth,
          compareDates,
          (value) =>
            value
              ? `${formatGenealogyDate(value.parsed)}${value.place ? ` · ${value.place}` : ''}`
              : '',
        ],
        [
          'Décès',
          result.left.death,
          result.right.death,
          compareDates,
          (value) =>
            value
              ? `${formatGenealogyDate(value.parsed)}${value.place ? ` · ${value.place}` : ''}`
              : '',
        ],
        [
          'Parents',
          names(result.left.relations.parents),
          names(result.right.relations.parents),
          compareLists,
          (v) => v.join(', '),
        ],
        [
          'Conjoints',
          names(result.left.relations.spouses),
          names(result.right.relations.spouses),
          compareLists,
          (v) => v.join(', '),
        ],
        [
          'Enfants',
          names(result.left.relations.children),
          names(result.right.relations.children),
          compareLists,
          (v) => v.join(', '),
        ],
      ]
    : [];
  const verdicts = rows.map(([, a, b, compare]) => compare(a, b));
  const contradictions = verdicts.filter((verdict) => verdict === 'different').length;

  return (
    <div className="search-panel compare-panel">
      <h3>Comparer deux personnes</h3>
      <div className="compare-panel__pickers">
        {[
          ['Première personne', leftId, setLeftId],
          ['Seconde personne', rightId, setRightId],
        ].map(([label, value, setter]) => (
          <label key={label}>
            <span>{label}</span>
            <select value={value} onChange={(event) => setter(event.target.value)}>
              <option value="">— choisir —</option>
              {persons.map((person) => (
                <option key={person.id} value={person.id}>
                  {personName(person)} (#{person.id})
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {error ? (
        <p role="alert" className="notice notice--error">
          {error}
        </p>
      ) : null}
      {result ? (
        <>
          <p role="status" className="notice">
            {contradictions === 0
              ? 'Aucune contradiction : ces fiches pourraient désigner la même personne.'
              : `${contradictions} différence(s) nette(s) : probablement deux personnes distinctes.`}
          </p>
          <table className="compare-table">
            <caption className="gds-visually-hidden">
              Comparaison de {personName(result.left.person)} et {personName(result.right.person)}
            </caption>
            <thead>
              <tr>
                <th scope="col">Champ</th>
                <th scope="col">{personName(result.left.person)}</th>
                <th scope="col">{personName(result.right.person)}</th>
                <th scope="col">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, a, b, , format = (v) => v ?? ''], index) => (
                <tr key={label} className={`compare-table__row--${verdicts[index]}`}>
                  <th scope="row">{label}</th>
                  <td>{format(a) || '—'}</td>
                  <td>{format(b) || '—'}</td>
                  <td>
                    <span className={`compare-verdict compare-verdict--${verdicts[index]}`}>
                      {VERDICTS[verdicts[index]]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {contradictions === 0 && onOpenDuplicates ? (
            <Button variant="secondary" onClick={onOpenDuplicates}>
              Ouvrir l’assistant de fusion des doublons
            </Button>
          ) : null}
        </>
      ) : (
        <p className="settings-hint">Choisissez deux personnes pour les comparer.</p>
      )}
    </div>
  );
}
