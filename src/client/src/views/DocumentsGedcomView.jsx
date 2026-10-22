import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, useTranslation } from '../design-system/index.js';
import { translate } from '../design-system/i18n/I18nProvider.jsx';
import { client } from '../api/app-client.js';
import { ErrorNotice, personLabel } from '../components/shared.jsx';
import { OldDocumentDecoder, PortraitPicker, WhoOwnsFile } from './DocumentTools.jsx';
import { PhotoViewer } from './PhotoViewer.jsx';
import { decodeGedcomBuffer } from '../../../server/src/gedcom/encoding.js';

const LOCALE_STORAGE_KEY = 'geneoapp.locale';

/**
 * Locale courante, lue dans le même stockage que le sélecteur de langue.
 * Ce module n’est pas un composant React : on lit donc directement, avec un
 * repli sur le français si le stockage est indisponible.
 */
function currentLocale() {
  try {
    return localStorage.getItem(LOCALE_STORAGE_KEY) ?? 'fr';
  } catch {
    return 'fr';
  }
}

export function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () =>
      reject(reader.error ?? new Error(translate(currentLocale(), 'gedcom.error.readFailed')));
    reader.readAsDataURL(file);
  });
}

// Écran unique et simple : déposer un fichier pour savoir à qui il appartient,
// puis déchiffrer s'il s'agit d'une écriture ancienne.
export function DocumentsHub({ onOpenPerson, onChanged }) {
  const [decodeId, setDecodeId] = useState(null);
  return (
    <div className="search-panel documents-hub">
      {decodeId !== null ? (
        <OldDocumentDecoder
          client={client}
          mediaId={decodeId}
          onClose={() => setDecodeId(null)}
          onLinked={onChanged}
        />
      ) : (
        <WhoOwnsFile client={client} onOpenPerson={onOpenPerson} onDecode={setDecodeId} />
      )}
    </div>
  );
}

export function MediaPanel({ selected, persons = [], onPersonChanged }) {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [decodeId, setDecodeId] = useState(null);
  const [appearsIn, setAppearsIn] = useState([]);
  const [openMediaId, setOpenMediaId] = useState(null);
  const [mediaError, setMediaError] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadMedia = useCallback(async () => {
    if (!selected) return;
    try {
      setItems(await client.media.listForEntity('PERSON', selected.id));
      const tagged = (await client.media.photosForPerson?.(selected.id)) ?? [];
      setAppearsIn(tagged.filter((item) => item.entity_id !== selected.id));
    } catch (loadError) {
      setMediaError(loadError.message);
    }
  }, [selected]);

  useEffect(() => {
    setItems(null);
    loadMedia();
  }, [loadMedia]);

  if (!selected) {
    return (
      <p className="notice">
        {t(
          'gedcom.media.emptySelection',
          'Sélectionnez une personne pour voir et ajouter des médias.',
        )}
      </p>
    );
  }

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setMediaError(null);
    try {
      const contentBase64 = await readFileAsBase64(file);
      await client.media.upload({
        filename: file.name,
        contentBase64,
        entityType: 'PERSON',
        entityId: selected.id,
      });
      await loadMedia();
    } catch (uploadError) {
      setMediaError(uploadError.message);
    } finally {
      setBusy(false);
      event.target.value = '';
    }
  };

  const handleDownload = async (id) => {
    setMediaError(null);
    try {
      const { filename, blob } = await client.media.download(id);
      downloadBlob(filename, blob);
    } catch (downloadError) {
      setMediaError(downloadError.message);
    }
  };

  const handleRemove = async (id) => {
    setBusy(true);
    setMediaError(null);
    try {
      await client.media.remove(id);
      await loadMedia();
    } catch (removeError) {
      setMediaError(removeError.message);
    } finally {
      setBusy(false);
    }
  };

  const handlePortrait = async (id) => {
    setMediaError(null);
    try {
      await client.media.setPortrait(selected.id, { mediaId: id });
      onPersonChanged?.();
    } catch (portraitError) {
      setMediaError(portraitError.message);
    }
  };

  if (decodeId !== null) {
    return (
      <div className="search-panel">
        <OldDocumentDecoder
          client={client}
          mediaId={decodeId}
          onClose={() => {
            setDecodeId(null);
            loadMedia();
          }}
        />
      </div>
    );
  }

  if (openMediaId !== null) {
    return (
      <div className="search-panel">
        <PhotoViewer
          client={client}
          mediaId={openMediaId}
          persons={persons}
          onClose={() => {
            setOpenMediaId(null);
            loadMedia();
          }}
        />
      </div>
    );
  }

  return (
    <div className="search-panel">
      <h3>{t('gedcom.media.title', { name: personLabel(selected) }, 'Médias de {name}')}</h3>
      <PortraitPicker client={client} person={selected} onChange={() => onPersonChanged?.()} />
      {mediaError ? <ErrorNotice message={mediaError} /> : null}

      <label className="gedcom-panel__file">
        <span>{t('gedcom.media.addFile', 'Ajouter un fichier')}</span>
        <input type="file" onChange={handleUpload} disabled={busy} />
      </label>

      {items === null ? (
        <p role="status">{t('gedcom.loading', 'Chargement…')}</p>
      ) : items.length === 0 ? (
        <p className="notice">{t('gedcom.media.none', 'Aucun média pour cette personne.')}</p>
      ) : (
        <ul className="search-results">
          {items.map((item) => (
            <li key={item.id}>
              <Badge tone="neutral">{item.ocr_status}</Badge> {item.original_filename}
              {item.taken_date ? <span className="data-id">{item.taken_date}</span> : null}
              <Button
                type="button"
                size="sm"
                onClick={() => setOpenMediaId(item.id)}
                aria-label={t(
                  'gedcom.media.open',
                  { name: item.original_filename },
                  'Ouvrir {name}',
                )}
              >
                {t('gedcom.media.openLabel', 'Ouvrir')}
              </Button>
              {item.mime_type?.startsWith('image/') || item.mime_type === 'application/pdf' ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setDecodeId(item.id)}
                  aria-label={t(
                    'gedcom.media.decode',
                    { name: item.original_filename },
                    'Déchiffrer {name}',
                  )}
                >
                  {t('gedcom.media.decodeLabel', 'Déchiffrer')}
                </Button>
              ) : null}
              {item.mime_type?.startsWith('image/') && selected.portrait_media_id !== item.id ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => handlePortrait(item.id)}
                >
                  {t('gedcom.media.setPortrait', 'Photo de profil')}
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => handleDownload(item.id)}
              >
                {t('gedcom.media.download', 'Télécharger')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="danger"
                onClick={() => handleRemove(item.id)}
                disabled={busy}
              >
                {t('gedcom.media.remove', 'Supprimer')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {appearsIn.length > 0 ? (
        <>
          <h4 className="media-panel__subtitle">
            {t('gedcom.media.appearsIn', 'Apparaît aussi sur')}
          </h4>
          <ul className="search-results">
            {appearsIn.map((item) => (
              <li key={item.id}>
                {item.original_filename}
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setOpenMediaId(item.id)}
                  aria-label={t(
                    'gedcom.media.open',
                    { name: item.original_filename },
                    'Ouvrir {name}',
                  )}
                >
                  {t('gedcom.media.openLabel', 'Ouvrir')}
                </Button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

function exportOptions(scope, personId) {
  switch (scope) {
    case 'ancestors':
      return { ancestorsOf: personId };
    case 'descendants':
      return { descendantsOf: personId };
    case 'paternal':
      return { branchOf: personId, side: 'PATERNAL' };
    case 'maternal':
      return { branchOf: personId, side: 'MATERNAL' };
    case 'person':
      return { personOnly: personId };
    default:
      return {};
  }
}

export function GedcomPanel({ onImported, selected }) {
  const { t } = useTranslation();
  const [content, setContent] = useState('');
  const [preview, setPreview] = useState(null);
  const [report, setReport] = useState(null);
  const [gedcomError, setGedcomError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [exportFormat, setExportFormat] = useState('7');
  const [exportScope, setExportScope] = useState('all');
  const [exportSummary, setExportSummary] = useState(null);
  const [archive, setArchive] = useState(null);
  const [archiveReport, setArchiveReport] = useState(null);

  const exportScopes = [
    { value: 'all', label: t('gedcom.scope.all', 'Arbre complet') },
    {
      value: 'ancestors',
      label: t('gedcom.scope.ancestors', 'Ancêtres de la personne de contexte'),
    },
    {
      value: 'descendants',
      label: t('gedcom.scope.descendants', 'Descendants de la personne de contexte'),
    },
    { value: 'paternal', label: t('gedcom.scope.paternal', 'Branche paternelle') },
    { value: 'maternal', label: t('gedcom.scope.maternal', 'Branche maternelle') },
    { value: 'person', label: t('gedcom.scope.person', 'Personne de contexte seule') },
  ];

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setArchiveReport(null);
    if (/\.(gdz|zip)$/i.test(file.name)) {
      // GEDZIP (GEDCOM 7 + médias) : importé tel quel, sans édition du texte.
      setArchive({ name: file.name, contentBase64: await readFileAsBase64(file) });
      setContent('');
      setPreview(null);
      setReport(null);
      return;
    }
    setArchive(null);
    // Lu en octets puis décodé selon l'encodage du fichier (ANSEL, ANSI, UTF-16…) :
    // `file.text()` supposerait de l'UTF-8 et remplacerait les accents par « � ».
    setContent(decodeGedcomBuffer(new Uint8Array(await file.arrayBuffer())).text);
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

  const handleImportArchive = async () => {
    setGedcomError(null);
    setBusy(true);
    try {
      const result = await client.gedcom.importArchive(archive.contentBase64);
      setArchiveReport(result);
      if (result.imported) {
        setArchive(null);
        await onImported();
      }
    } catch (importError) {
      setGedcomError(importError.message);
    } finally {
      setBusy(false);
    }
  };

  const handleExportArchive = async () => {
    setGedcomError(null);
    setBusy(true);
    try {
      const scope = selected ? exportScope : 'all';
      const result = await client.gedcom.exportArchive(exportOptions(scope, selected?.id));
      const bytes = Uint8Array.from(atob(result.contentBase64), (char) => char.charCodeAt(0));
      downloadBlob(
        scope === 'all' ? 'geneoapp-export.gdz' : `geneoapp-export-${scope}.gdz`,
        new Blob([bytes], { type: 'application/zip' }),
      );
      if (result.summary) setExportSummary(result.summary);
    } catch (exportError) {
      setGedcomError(exportError.message);
    } finally {
      setBusy(false);
    }
  };

  const handleExport = async () => {
    setGedcomError(null);
    setBusy(true);
    try {
      const scope = selected ? exportScope : 'all';
      const result = await client.gedcom.export({
        format: exportFormat,
        ...exportOptions(scope, selected?.id),
      });
      downloadText(
        scope === 'all'
          ? `geneoapp-export-${exportFormat}.ged`
          : `geneoapp-export-${scope}-${exportFormat}.ged`,
        result.gedcom,
      );
      if (result.summary) setExportSummary(result.summary);
    } catch (exportError) {
      setGedcomError(exportError.message);
    } finally {
      setBusy(false);
    }
  };

  // Résumé de l'import d'une archive : les parties variables (personnes,
  // médias, fichiers manquants ou refusés) sont traduites séparément, puis
  // assemblées dans la phrase.
  const archiveParts = [];
  if (archiveReport?.imported) {
    archiveParts.push(
      t(
        'gedcom.count.persons',
        { count: archiveReport.mapping.persons },
        `${archiveReport.mapping.persons} personnes`,
      ),
      t(
        'gedcom.archive.count.attached',
        { count: archiveReport.media.attached },
        `${archiveReport.media.attached} médias rattachés`,
      ),
    );
    if (archiveReport.media.missing.length > 0) {
      archiveParts.push(
        `${t(
          'gedcom.archive.count.missing',
          { count: archiveReport.media.missing.length },
          `${archiveReport.media.missing.length} fichiers absents`,
        )} ${t('gedcom.archive.fromArchive', 'de l’archive')}`,
      );
    }
    if (archiveReport.media.rejected.length > 0) {
      archiveParts.push(
        `${t(
          'gedcom.archive.count.rejected',
          { count: archiveReport.media.rejected.length },
          `${archiveReport.media.rejected.length} fichiers refusés`,
        )} : ${archiveReport.media.rejected.map((item) => `${item.file} (${item.reason})`).join(', ')}`,
      );
    }
  }

  return (
    <div className="gedcom-panel">
      <label className="gedcom-panel__file">
        <span>
          {t('gedcom.import.fileLabel', 'Fichier GEDCOM (.ged) ou GEDZIP avec médias (.gdz, .zip)')}
        </span>
        <input type="file" accept=".ged,.gdz,.zip" onChange={handleFile} />
      </label>
      {archive ? (
        <div className="notice" role="status">
          <p>
            {t('gedcom.archive.readyLabel', 'Archive prête :')} <strong>{archive.name}</strong>
            {t(
              'gedcom.archive.readyDetails',
              '. Les personnes, familles et événements sont importés en une transaction, puis les fichiers médias rattachés.',
            )}
          </p>
          <Button type="button" size="sm" onClick={handleImportArchive} disabled={busy}>
            {t('gedcom.archive.import', 'Importer l’archive GEDZIP')}
          </Button>
        </div>
      ) : null}
      {archiveReport ? (
        <p className="notice" role="status">
          {archiveReport.imported
            ? t(
                'gedcom.archive.imported',
                { parts: archiveParts.join(', ') },
                'Archive importée : {parts}.',
              )
            : t('gedcom.import.rejected', 'Import refusé : aucune donnée écrite (rollback).')}
        </p>
      ) : null}
      <textarea
        aria-label={t('gedcom.import.contentLabel', 'Contenu GEDCOM')}
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
          {t('gedcom.import.preview', 'Aperçu')}
        </Button>
        <Button type="button" size="sm" onClick={handleImport} disabled={busy || !preview?.valid}>
          {t('gedcom.import.run', 'Importer')}
        </Button>
      </div>
      {gedcomError ? <ErrorNotice message={gedcomError} /> : null}
      {preview ? (
        <p className="notice" role="status">
          {preview.valid
            ? t(
                'gedcom.import.previewValid',
                {
                  persons: t(
                    'gedcom.count.persons',
                    { count: preview.mapping.persons },
                    `${preview.mapping.persons} personnes`,
                  ),
                  unions: t(
                    'gedcom.count.unions',
                    { count: preview.mapping.unions },
                    `${preview.mapping.unions} unions`,
                  ),
                  events: t(
                    'gedcom.count.events',
                    { count: preview.mapping.events },
                    `${preview.mapping.events} événements`,
                  ),
                },
                'Aperçu valide : {persons}, {unions}, {events}.',
              )
            : t(
                'gedcom.import.previewInvalid',
                {
                  errors:
                    preview.errors?.map((issue) => issue.message).join(', ') ||
                    t('gedcom.import.seeReport', 'voir le rapport'),
                },
                'GEDCOM invalide : {errors}',
              )}
        </p>
      ) : null}
      {report ? (
        <p className="notice" role="status">
          {report.imported
            ? t('gedcom.import.success', 'Import réussi et transactionnel.')
            : t('gedcom.import.rejected', 'Import refusé : aucune donnée écrite (rollback).')}
        </p>
      ) : null}

      <div className="gedcom-panel__export">
        <label>
          <span>{t('gedcom.export.format', 'Format d’export')}</span>
          <select value={exportFormat} onChange={(event) => setExportFormat(event.target.value)}>
            <option value="7">{t('gedcom.export.format7', 'GEDCOM 7')}</option>
            <option value="5.5.1">{t('gedcom.export.format551', 'GEDCOM 5.5.1')}</option>
          </select>
        </label>
        <label>
          <span>{t('gedcom.export.scope', 'Périmètre')}</span>
          <select value={exportScope} onChange={(event) => setExportScope(event.target.value)}>
            {exportScopes.map((scope) => (
              <option
                key={scope.value}
                value={scope.value}
                disabled={scope.value !== 'all' && !selected}
              >
                {scope.label}
              </option>
            ))}
          </select>
        </label>
        <Button type="button" size="sm" variant="secondary" onClick={handleExport} disabled={busy}>
          {exportScope === 'all' || !selected
            ? t('gedcom.export.all', 'Exporter l’arbre complet')
            : t('gedcom.export.scopeAction', 'Exporter le périmètre')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={handleExportArchive}
          disabled={busy}
        >
          {t('gedcom.export.archive', 'Exporter en GEDZIP (avec médias)')}
        </Button>
        {selected && exportScope !== 'all' ? (
          <p className="settings-hint">
            {t(
              'gedcom.export.contextPerson',
              { name: personLabel(selected) },
              'Personne de contexte : {name}',
            )}
          </p>
        ) : null}
        {exportSummary ? (
          <p role="status" className="data-id">
            {t(
              'gedcom.export.summary',
              {
                persons: t(
                  'gedcom.count.persons',
                  { count: exportSummary.persons },
                  `${exportSummary.persons} personnes`,
                ),
                families: t(
                  'gedcom.count.families',
                  { count: exportSummary.families },
                  `${exportSummary.families} familles`,
                ),
              },
              'Exporté : {persons}, {families}',
            )}
          </p>
        ) : null}
      </div>
    </div>
  );
}
