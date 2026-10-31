import { useEffect, useState } from 'react';
import { Button, useTranslation } from '../design-system/index.js';
import { client } from '../api/app-client.js';
import { ErrorNotice, personLabel } from '../components/shared.jsx';

export const BOOK_MAX_GENERATIONS = 20;

/** Enregistre un PDF reçu en base64 (aucune requête réseau : génération locale). */
export function savePdf(filename, contentBase64) {
  const bytes = Uint8Array.from(atob(contentBase64), (char) => char.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Export d'un livre généalogique PDF : personne racine (ou arbre entier),
 * sens, nombre de générations, inclusion des vivants (masqués par défaut).
 */
export function BookExportPanel({ selected, persons = [] }) {
  const { t, locale } = useTranslation();
  const [rootId, setRootId] = useState(selected ? String(selected.id) : '');
  const [direction, setDirection] = useState('both');
  const [generations, setGenerations] = useState(4);
  const [includeLiving, setIncludeLiving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    if (selected) setRootId(String(selected.id));
  }, [selected]);

  const handleExport = async () => {
    setError(null);
    setSummary(null);
    setBusy(true);
    try {
      const result = await client.reports.book({
        ...(rootId ? { rootPersonId: Number(rootId), direction, generations } : {}),
        includeLiving,
        locale,
      });
      savePdf(result.filename, result.contentBase64);
      setSummary(result.summary);
    } catch (exportError) {
      setError(exportError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <fieldset className="gedcom-panel__export book-export">
      <legend>{t('book.title', 'Livre généalogique (PDF)')}</legend>
      <p className="settings-hint">
        {t(
          'book.hint',
          'Page de titre, table des matières, une fiche par personne, index des noms et liste des sources. Généré sur cet ordinateur.',
        )}
      </p>
      <label>
        <span>{t('book.root', 'Personne racine')}</span>
        <select value={rootId} onChange={(event) => setRootId(event.target.value)}>
          <option value="">{t('book.rootAll', 'Tout l’arbre')}</option>
          {persons.map((person) => (
            <option key={person.id} value={person.id}>
              {personLabel(person)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>{t('book.direction', 'Sens')}</span>
        <select
          value={direction}
          disabled={!rootId}
          onChange={(event) => setDirection(event.target.value)}
        >
          <option value="both">{t('book.direction.both', 'Ascendants et descendants')}</option>
          <option value="ancestors">{t('book.direction.ancestors', 'Ascendants')}</option>
          <option value="descendants">{t('book.direction.descendants', 'Descendants')}</option>
        </select>
      </label>
      <label>
        <span>{t('book.generations', 'Générations')}</span>
        <input
          type="number"
          min="0"
          max={BOOK_MAX_GENERATIONS}
          value={generations}
          disabled={!rootId}
          onChange={(event) => {
            const value = Number(event.target.value);
            if (Number.isInteger(value)) {
              setGenerations(Math.min(BOOK_MAX_GENERATIONS, Math.max(0, value)));
            }
          }}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={includeLiving}
          onChange={(event) => setIncludeLiving(event.target.checked)}
        />{' '}
        <span>{t('book.includeLiving', 'Inclure les personnes vivantes ou privées')}</span>
      </label>
      <p className="settings-hint">
        {includeLiving
          ? t(
              'book.livingIncluded',
              'Attention : le livre contiendra des informations sur des personnes vivantes.',
            )
          : t('book.livingHidden', 'Par défaut, les personnes vivantes ou privées sont masquées.')}
      </p>
      <Button type="button" size="sm" variant="secondary" onClick={handleExport} disabled={busy}>
        {busy ? t('book.generating', 'Génération…') : t('book.export', 'Exporter un livre PDF')}
      </Button>
      {error ? <ErrorNotice message={error} /> : null}
      {summary ? (
        <p role="status" className="data-id">
          {t(
            'book.done',
            { persons: summary.persons, sources: summary.sources, hidden: summary.hidden },
            'Livre exporté : {persons} fiche(s), {sources} source(s), {hidden} personne(s) masquée(s).',
          )}
        </p>
      ) : null}
    </fieldset>
  );
}
