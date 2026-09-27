import { useCallback, useEffect, useState } from 'react';
import { Badge, Button } from '../design-system/index.js';
import { client } from '../api/app-client.js';
import { ErrorNotice, personLabel } from '../components/shared.jsx';
import { countedFr } from '../hooks/useVerification.js';
import { OldDocumentDecoder, PortraitPicker, WhoOwnsFile } from './DocumentTools.jsx';
import { PhotoViewer } from './PhotoViewer.jsx';

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
    reader.onerror = () => reject(reader.error ?? new Error('Lecture du fichier impossible'));
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
    return <p className="notice">Sélectionnez une personne pour voir et ajouter des médias.</p>;
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
      <h3>Médias de {personLabel(selected)}</h3>
      <PortraitPicker client={client} person={selected} onChange={() => onPersonChanged?.()} />
      {mediaError ? <ErrorNotice message={mediaError} /> : null}

      <label className="gedcom-panel__file">
        <span>Ajouter un fichier</span>
        <input type="file" onChange={handleUpload} disabled={busy} />
      </label>

      {items === null ? (
        <p role="status">Chargement…</p>
      ) : items.length === 0 ? (
        <p className="notice">Aucun média pour cette personne.</p>
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
                aria-label={`Ouvrir ${item.original_filename}`}
              >
                Ouvrir
              </Button>
              {item.mime_type?.startsWith('image/') || item.mime_type === 'application/pdf' ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setDecodeId(item.id)}
                  aria-label={`Déchiffrer ${item.original_filename}`}
                >
                  Déchiffrer
                </Button>
              ) : null}
              {item.mime_type?.startsWith('image/') && selected.portrait_media_id !== item.id ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => handlePortrait(item.id)}
                >
                  Photo de profil
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => handleDownload(item.id)}
              >
                Télécharger
              </Button>
              <Button
                type="button"
                size="sm"
                variant="danger"
                onClick={() => handleRemove(item.id)}
                disabled={busy}
              >
                Supprimer
              </Button>
            </li>
          ))}
        </ul>
      )}
      {appearsIn.length > 0 ? (
        <>
          <h4 className="media-panel__subtitle">Apparaît aussi sur</h4>
          <ul className="search-results">
            {appearsIn.map((item) => (
              <li key={item.id}>
                {item.original_filename}
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setOpenMediaId(item.id)}
                  aria-label={`Ouvrir ${item.original_filename}`}
                >
                  Ouvrir
                </Button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

const EXPORT_SCOPES = {
  all: 'Arbre complet',
  ancestors: 'Ancêtres de la personne de contexte',
  descendants: 'Descendants de la personne de contexte',
  paternal: 'Branche paternelle',
  maternal: 'Branche maternelle',
  person: 'Personne de contexte seule',
};

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

  return (
    <div className="gedcom-panel">
      <label className="gedcom-panel__file">
        <span>Fichier GEDCOM (.ged) ou GEDZIP avec médias (.gdz, .zip)</span>
        <input type="file" accept=".ged,.gdz,.zip" onChange={handleFile} />
      </label>
      {archive ? (
        <div className="notice" role="status">
          <p>
            Archive prête : <strong>{archive.name}</strong>. Les personnes, familles et événements
            sont importés en une transaction, puis les fichiers médias rattachés.
          </p>
          <Button type="button" size="sm" onClick={handleImportArchive} disabled={busy}>
            Importer l’archive GEDZIP
          </Button>
        </div>
      ) : null}
      {archiveReport ? (
        <p className="notice" role="status">
          {archiveReport.imported
            ? `Archive importée : ${countedFr(archiveReport.mapping.persons, { one: 'personne', other: 'personnes' })}, ${countedFr(archiveReport.media.attached, { one: 'média rattaché', other: 'médias rattachés' })}` +
              (archiveReport.media.missing.length
                ? `, ${countedFr(archiveReport.media.missing.length, { one: 'fichier absent', other: 'fichiers absents' })} de l’archive`
                : '') +
              (archiveReport.media.rejected.length
                ? `, ${countedFr(archiveReport.media.rejected.length, { one: 'fichier refusé', other: 'fichiers refusés' })} : ${archiveReport.media.rejected.map((item) => `${item.file} (${item.reason})`).join(', ')}`
                : '') +
              '.'
            : 'Import refusé : aucune donnée écrite (rollback).'}
        </p>
      ) : null}
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
      {gedcomError ? <ErrorNotice message={gedcomError} /> : null}
      {preview ? (
        <p className="notice" role="status">
          {preview.valid
            ? `Aperçu valide : ${countedFr(preview.mapping.persons, { one: 'personne', other: 'personnes' })}, ${countedFr(preview.mapping.unions, { one: 'union', other: 'unions' })}, ${countedFr(preview.mapping.events, { one: 'événement', other: 'événements' })}.`
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
        <label>
          <span>Périmètre</span>
          <select value={exportScope} onChange={(event) => setExportScope(event.target.value)}>
            {Object.entries(EXPORT_SCOPES).map(([value, label]) => (
              <option key={value} value={value} disabled={value !== 'all' && !selected}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <Button type="button" size="sm" variant="secondary" onClick={handleExport} disabled={busy}>
          {exportScope === 'all' || !selected
            ? 'Exporter l’arbre complet'
            : 'Exporter le périmètre'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={handleExportArchive}
          disabled={busy}
        >
          Exporter en GEDZIP (avec médias)
        </Button>
        {selected && exportScope !== 'all' ? (
          <p className="settings-hint">Personne de contexte : {personLabel(selected)}</p>
        ) : null}
        {exportSummary ? (
          <p role="status" className="data-id">
            Exporté : {countedFr(exportSummary.persons, { one: 'personne', other: 'personnes' })},{' '}
            {countedFr(exportSummary.families, { one: 'famille', other: 'familles' })}
          </p>
        ) : null}
      </div>
    </div>
  );
}
