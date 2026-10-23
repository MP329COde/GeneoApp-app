import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, useTranslation } from '../design-system/index.js';
import { ErrorNotice } from '../components/shared.jsx';

// Identifiants externes d'une personne (FamilySearch, Geneanet, Wikidata…) :
// ils servent à retrouver une fiche et à repérer les doublons à l'import.
export function IdentifiersPanel({ client, personId }) {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ scheme: '', value: '' });

  const load = useCallback(async () => {
    try {
      setItems((await client.persons.listIdentifiers(personId)) ?? []);
    } catch (loadError) {
      setError(loadError.message);
    }
  }, [client, personId]);

  useEffect(() => {
    setItems(null);
    load();
  }, [load]);

  const run = async (action) => {
    setError(null);
    try {
      await action();
      await load();
      return true;
    } catch (actionError) {
      setError(actionError.message);
      return false;
    }
  };

  const handleAdd = async (event) => {
    event.preventDefault();
    if (!form.scheme.trim() || !form.value.trim()) return;
    const ok = await run(() =>
      client.persons.addIdentifier(personId, {
        scheme: form.scheme.trim(),
        value: form.value.trim(),
      }),
    );
    if (ok) setForm({ scheme: form.scheme, value: '' });
  };

  return (
    <section className="identifiers-panel" aria-labelledby={`identifiers-${personId}`}>
      <h3 id={`identifiers-${personId}`}>{t('identifiers.heading', 'Identifiants externes')}</h3>
      {error ? <ErrorNotice message={error} /> : null}
      <form className="create-person-form" onSubmit={handleAdd}>
        <label>
          <span>{t('identifiers.scheme', 'Référentiel (ex. WIKIDATA)')}</span>
          <input
            value={form.scheme}
            onChange={(event) => setForm({ ...form, scheme: event.target.value })}
          />
        </label>
        <label>
          <span>{t('identifiers.value', 'Identifiant')}</span>
          <input
            value={form.value}
            onChange={(event) => setForm({ ...form, value: event.target.value })}
          />
        </label>
        <Button type="submit" size="sm" disabled={!form.scheme.trim() || !form.value.trim()}>
          {t('identifiers.add', 'Ajouter l’identifiant')}
        </Button>
      </form>
      {items === null ? (
        <p role="status">{t('identifiers.loading', 'Chargement…')}</p>
      ) : items.length === 0 ? (
        <p className="notice">{t('identifiers.empty', 'Aucun identifiant externe.')}</p>
      ) : (
        <ul className="search-results">
          {items.map((item) => (
            <li key={item.id}>
              <Badge tone="neutral">{item.scheme}</Badge> {item.value}{' '}
              <Button
                type="button"
                size="sm"
                variant="danger"
                aria-label={t(
                  'identifiers.removeLabel',
                  { scheme: item.scheme, value: item.value },
                  'Retirer {scheme} {value}',
                )}
                onClick={() => run(() => client.persons.removeIdentifier(personId, item.id))}
              >
                {t('identifiers.remove', 'Retirer')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
