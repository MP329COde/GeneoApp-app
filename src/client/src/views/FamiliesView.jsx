import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, useTranslation } from '../design-system/index.js';
import { client } from '../api/app-client.js';
import { ErrorNotice, personLabel } from '../components/shared.jsx';
import { UNION_TYPES, UNION_TYPE_KEYS } from './PersonListPanels.jsx';
import { ParentageSection } from './PersonRelationsView.jsx';

export function FamiliesPanel({ persons, selected, onNavigate, onChange }) {
  const { t } = useTranslation();
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
    return (
      <p className="notice">
        {t('family.selectPerson', 'Sélectionnez une personne pour voir et gérer ses familles.')}
      </p>
    );
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
    if (
      !window.confirm(
        t(
          'family.removeConfirm',
          'Dissoudre / supprimer cette union ? Cette action est irréversible.',
        ),
      )
    ) {
      return;
    }
    setBusy(true);
    setFamiliesError(null);
    try {
      await client.unions.remove(unionId);
      await loadUnions();
      await onChange?.();
    } catch (removeError) {
      console.error(t('family.removeError', "Échec de la suppression de l'union"), removeError);
      setFamiliesError(
        t(
          'family.removeErrorDetail',
          "La suppression de l'union a échoué. Vérifiez votre connexion locale et réessayez.",
        ),
      );
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
      <h3>{t('family.title', { name: personLabel(selected) }, 'Familles de {name}')}</h3>
      {familiesError ? <ErrorNotice message={familiesError} /> : null}

      <form className="create-person-form" onSubmit={handleCreate}>
        <label>
          <span>{t('family.unionType', 'Type d’union')}</span>
          <select value={type} onChange={(event) => setType(event.target.value)}>
            {UNION_TYPES.map((unionType) => (
              <option key={unionType} value={unionType}>
                {t(UNION_TYPE_KEYS[unionType] ?? '', unionType)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t('family.partner', 'Partenaire')}</span>
          <select value={partnerId} onChange={(event) => setPartnerId(event.target.value)}>
            <option value="">{t('family.choosePartner', '— Choisir une personne —')}</option>
            {otherPersons.map((person) => (
              <option key={person.id} value={person.id}>
                {personLabel(person)}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" size="sm" disabled={busy || !partnerId}>
          {t('family.create', 'Créer l’union')}
        </Button>
      </form>

      {unions === null ? (
        <p role="status">{t('family.loading', 'Chargement…')}</p>
      ) : unions.length === 0 ? (
        <p className="notice">
          {t('family.empty', 'Aucune union enregistrée pour cette personne.')}
        </p>
      ) : (
        <ul className="search-results">
          {unions.map((union) => (
            <li key={union.id}>
              <Badge tone="neutral">{t(UNION_TYPE_KEYS[union.type] ?? '', union.type)}</Badge>{' '}
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
                {t('family.remove', 'Dissoudre / supprimer')}
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
