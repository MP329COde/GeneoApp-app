import { useEffect, useRef, useState } from 'react';
import { Badge, Button } from '../design-system/index.js';
import { client } from '../api/app-client.js';
import { ErrorNotice, personLabel } from '../components/shared.jsx';
import { countedFr } from '../hooks/useVerification.js';
import { AdvancedSearch } from './AdvancedSearch.jsx';
import { SiteSearch } from './SiteSearch.jsx';

export function CreatePersonForm({ onCreate, creating }) {
  const [givenNames, setGivenNames] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [sex, setSex] = useState('');
  const firstNameRef = useRef(null);

  useEffect(() => {
    firstNameRef.current?.focus();
  }, []);

  const previewName =
    [givenNames.trim(), familyName.trim()].filter(Boolean).join(' ') || 'Nouvelle personne';

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!givenNames.trim() || !familyName.trim()) return;
    const created = await onCreate({
      givenNames: givenNames.trim(),
      familyName: familyName.trim(),
      ...(sex ? { sex } : {}),
    });
    if (created !== false) {
      setGivenNames('');
      setFamilyName('');
      setSex('');
    }
  };

  return (
    <form className="create-person-form" onSubmit={handleSubmit}>
      <div className="create-person-form__header">
        <span className="create-person-form__label">Prévisualisation</span>
        <strong>{previewName}</strong>
      </div>
      <label>
        <span>Prénom(s)</span>
        <input
          ref={firstNameRef}
          value={givenNames}
          onChange={(event) => setGivenNames(event.target.value)}
          placeholder="Ex. Jean"
        />
      </label>
      <label>
        <span>Nom</span>
        <input
          value={familyName}
          onChange={(event) => setFamilyName(event.target.value)}
          placeholder="Ex. Dupont"
        />
      </label>
      <label>
        <span>Sexe</span>
        <select value={sex} onChange={(event) => setSex(event.target.value)}>
          <option value="">Inconnu</option>
          <option value="F">Femme</option>
          <option value="M">Homme</option>
        </select>
      </label>
      <p className="settings-hint">
        Les dates, lieux et liens se complètent ensuite en quelques clics.
      </p>
      <Button type="submit" disabled={creating || !givenNames.trim() || !familyName.trim()}>
        Ajouter une personne
      </Button>
    </form>
  );
}

export function SearchPanel({ onNavigate, selected, lifespan }) {
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
      {searchError ? <ErrorNotice message={searchError} /> : null}
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
      <AdvancedSearch client={client} onNavigate={onNavigate} />
      <SiteSearch key={selected?.id ?? 'none'} person={selected} lifespan={lifespan} />
    </div>
  );
}

export const MERGE_REASSIGNMENT_LABELS = {
  parentagesAsParent: { one: 'lien parent → enfant', other: 'liens parent → enfant' },
  parentagesAsChild: { one: 'lien enfant → parent', other: 'liens enfant → parent' },
  unionPartnerships: { one: 'union', other: 'unions' },
  eventParticipations: {
    one: 'participation à un événement',
    other: 'participations à un événement',
  },
  citations: { one: 'citation de source', other: 'citations de source' },
  notes: { one: 'note', other: 'notes' },
  media: { one: 'média', other: 'médias' },
};

export function DuplicatesPanel({ onSelect, onMerged }) {
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
      setPairs((current) => {
        if (!current) return current;
        const items = current.items.filter(
          (pair) => !pair.persons.some((person) => person.id === duplicateId),
        );
        return { items, total: Math.max(current.total - (current.items.length - items.length), 0) };
      });
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
      {duplicatesError ? <ErrorNotice message={duplicatesError} /> : null}
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
                  {countedFr(count, MERGE_REASSIGNMENT_LABELS[key] ?? { one: key, other: key })}
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
      {pairs === null ? null : pairs.items.length === 0 ? (
        <p className="notice">Aucun doublon potentiel détecté.</p>
      ) : (
        <ul className="search-results">
          {pairs.total > pairs.items.length ? (
            <li className="notice">
              {countedFr(pairs.total, {
                one: 'doublon possible détecté au total',
                other: 'doublons possibles détectés au total',
              })}{' '}
              — les {pairs.items.length} scores les plus élevés sont affichés ci-dessous.
            </li>
          ) : null}
          {pairs.items.map((pair) => {
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

// Constantes réutilisées par les vues Familles (unions) et Parenté (rôles),
// conservées ici pour rester à côté de DuplicatesPanel qui les référence
// aussi via le regroupement de réassignations (voir MERGE_REASSIGNMENT_LABELS).
export const UNION_TYPES = ['MARRIAGE', 'CIVIL_PARTNERSHIP', 'COHABITATION', 'OTHER'];

export const UNION_TYPE_LABELS = {
  MARRIAGE: 'Mariage',
  CIVIL_PARTNERSHIP: 'Union civile (PACS)',
  COHABITATION: 'Concubinage',
  OTHER: 'Autre union',
};

export const PARENT_ROLES = ['FATHER', 'MOTHER', 'PARENT'];

export const PARENT_ROLE_LABELS = {
  FATHER: 'Père',
  MOTHER: 'Mère',
  PARENT: 'Parent',
};
