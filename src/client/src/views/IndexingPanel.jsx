import { useCallback, useEffect, useState } from 'react';
import { Badge, Button } from '../design-system/index.js';

const STATUS_LABELS = { EXTRACTED: 'Texte', OCR: 'OCR', UNAVAILABLE: 'Titre seul' };
const RUN_LABELS = { DONE: 'Terminée', FAILED: 'Échec', RUNNING: 'En cours' };
const TRIGGER_LABELS = { MANUAL: 'manuelle', SCHEDULED: 'planifiée', CLI: 'ligne de commande' };
const MODE_LABELS = { CRAWL: 'Site', DIRECT: 'Fichier', DATAGOUV: 'data.gouv.fr' };
const OUTCOME_TONES = { DONE: 'success', PARTIAL: 'neutral', FAILED: 'danger', SKIPPED: 'neutral' };
const OUTCOME_LABELS = { DONE: 'À jour', PARTIAL: 'Partiel', FAILED: 'Échec', SKIPPED: 'Ignoré' };
const NETWORK_MODES = [
  {
    mode: 'CRAWL',
    label: 'Site d’archives (exploration des liens)',
    placeholder: 'https://archives.exemple.fr/registres',
  },
  {
    mode: 'DIRECT',
    label: 'Fichier de données ouvertes (CSV, JSON, TXT, ZIP, PDF)',
    placeholder: 'https://exemple.fr/donnees/registre.csv',
  },
  {
    mode: 'DATAGOUV',
    label: 'Jeu de données data.gouv.fr',
    placeholder: 'https://www.data.gouv.fr/fr/datasets/…',
  },
];
const PAGE_SIZE = 25;

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString('fr-FR') : '—';
}

// Documents indexés (ADR 0011) : recherche plein texte d'abord, puis sources
// (dossiers, sites), réglages de planification et journal.
export function IndexingPanel({ client }) {
  const [status, setStatus] = useState(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState(null);
  const [folder, setFolder] = useState('');
  const [site, setSite] = useState('');
  const [depth, setDepth] = useState(2);
  const [mode, setMode] = useState('CRAWL');
  const [resourceFilter, setResourceFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [page, setPage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  const load = useCallback(async () => {
    try {
      setStatus(await client.indexing.status());
    } catch (loadError) {
      setError(loadError.message);
    }
  }, [client]);

  useEffect(() => {
    load();
  }, [load]);

  // Progression : le statut est relu tant qu'une indexation tourne.
  useEffect(() => {
    if (!status?.running && !busy) return undefined;
    const timer = setInterval(load, 1500);
    return () => clearInterval(timer);
  }, [status?.running, busy, load]);

  const searchAt = async (offset) => {
    setError(null);
    try {
      const result = await client.indexing.searchPage(query.trim(), {
        limit: PAGE_SIZE,
        offset,
        sourceId: sourceFilter || null,
      });
      setPage(result);
      setHits(result.hits);
      setPreview(null);
    } catch (searchError) {
      setError(searchError.message);
    }
  };

  const showPreview = async (hit) => {
    if (preview?.id === hit.id) {
      setPreview(null);
      return;
    }
    try {
      setPreview(await client.indexing.document(hit.id));
    } catch (previewError) {
      setError(previewError.message);
    }
  };

  const runSummary = (result) =>
    `Indexation ${result.status === 'DONE' ? 'terminée' : 'interrompue'} : ${result.indexed} nouveau(x), ${result.unchanged} inchangé(s), ${result.skipped} ignoré(s), ${result.errors} erreur(s).${result.message ? ` ${result.message}` : ''}`;

  const launch = async (action) => {
    setBusy(true);
    const pending = run(action, runSummary);
    setTimeout(load, 300);
    await pending;
    setBusy(false);
  };

  const run = async (action, success) => {
    setError(null);
    setMessage(null);
    try {
      const result = await action();
      await load();
      if (success) setMessage(typeof success === 'function' ? success(result) : success);
      return true;
    } catch (actionError) {
      setError(actionError.message);
      return false;
    }
  };

  const openHit = async (hit) => {
    if (hit.media_id) {
      const { filename, blob } = await client.media.download(hit.media_id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } else if (/^https?:\/\//.test(hit.location)) {
      window.open(hit.location, '_blank', 'noopener,noreferrer');
    }
  };

  if (!status) {
    return error ? (
      <p role="alert" className="notice notice--error">
        {error}
      </p>
    ) : (
      <p role="status" className="loading-line">
        Chargement…
      </p>
    );
  }

  const { settings, sources, runs, progress, stats, presets = [] } = status;
  const currentMode = NETWORK_MODES.find((item) => item.mode === mode);

  return (
    <div className="search-panel indexing-panel">
      <h3>Documents indexés</h3>
      <form
        className="search-panel__form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!query.trim()) return;
          await searchAt(0);
        }}
      >
        <label className="search-box">
          <span>Rechercher dans les documents</span>
          <input
            value={query}
            placeholder='acte, nom, lieu… « "jean baptiste" -paris »'
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label>
          <span>Source</span>
          <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
            <option value="">Toutes</option>
            {sources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.label}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" size="sm">
          Chercher
        </Button>
      </form>
      {hits ? (
        hits.length === 0 ? (
          <p className="notice">Aucun document ne contient « {query} ».</p>
        ) : (
          <ul className="search-results indexing-hits">
            {hits.map((hit) => (
              <li key={hit.id}>
                <div className="indexing-hits__main">
                  <strong>{hit.title}</strong>
                  <span className="data-id">
                    {hit.source_label} · {hit.location}
                  </span>
                  {hit.snippet ? (
                    <span className="indexing-hits__snippet">{hit.snippet}</span>
                  ) : null}
                </div>
                <Badge tone="neutral">{STATUS_LABELS[hit.text_status] ?? hit.text_status}</Badge>
                <Button size="sm" variant="secondary" onClick={() => showPreview(hit)}>
                  {preview?.id === hit.id ? 'Masquer' : 'Aperçu'}
                </Button>
                {hit.media_id || /^https?:\/\//.test(hit.location) ? (
                  <Button size="sm" variant="secondary" onClick={() => openHit(hit)}>
                    Ouvrir
                  </Button>
                ) : null}
                {preview?.id === hit.id ? (
                  <pre className="indexing-preview">{preview.text || 'Aucun texte extrait.'}</pre>
                ) : null}
              </li>
            ))}
          </ul>
        )
      ) : null}
      {page && page.total > PAGE_SIZE ? (
        <div className="gedcom-panel__actions">
          <span className="data-id">
            {page.offset + 1}–{Math.min(page.offset + PAGE_SIZE, page.total)} sur {page.total}
          </span>
          <Button
            size="sm"
            variant="secondary"
            disabled={page.offset === 0}
            onClick={() => searchAt(Math.max(0, page.offset - PAGE_SIZE))}
          >
            Précédents
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={page.offset + PAGE_SIZE >= page.total}
            onClick={() => searchAt(page.offset + PAGE_SIZE)}
          >
            Suivants
          </Button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="notice notice--error">
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="notice">
          {message}
        </p>
      ) : null}

      <section className="research-section" aria-labelledby="indexing-sources">
        <h4 id="indexing-sources">Sources ({sources.length})</h4>
        {sources.length === 0 ? (
          <p className="settings-hint">
            Ajoutez un dossier (scans, PDF, notes) ou un site d’archives à indexer.
          </p>
        ) : (
          <ul className="task-list">
            {sources.map((source) => (
              <li key={source.id} className="task">
                <label className="task__check">
                  <input
                    type="checkbox"
                    checked={source.enabled === 1}
                    onChange={(event) =>
                      run(() => client.indexing.setSource(source.id, event.target.checked))
                    }
                  />
                  <span>
                    {source.kind === 'FOLDER' ? 'Dossier' : MODE_LABELS[source.mode]} ·{' '}
                    {source.label}
                    <small className="settings-hint">
                      {' '}
                      {source.location}
                      {source.resource_filter ? ` · filtre « ${source.resource_filter} »` : ''}
                    </small>
                    {source.last_message ? (
                      <small className="settings-hint"> {source.last_message}</small>
                    ) : null}
                  </span>
                </label>
                {source.last_status ? (
                  <Badge tone={OUTCOME_TONES[source.last_status]}>
                    {OUTCOME_LABELS[source.last_status]}
                  </Badge>
                ) : null}
                <span className="data-id">{source.document_count} document(s)</span>
                <button
                  type="button"
                  className="link-button link-button--small"
                  disabled={busy || status.running}
                  aria-label={`Indexer maintenant ${source.label}`}
                  onClick={() => launch(() => client.indexing.runSource(source.id))}
                >
                  Indexer
                </button>
                <button
                  type="button"
                  className="link-button link-button--small"
                  disabled={busy || status.running}
                  aria-label={`Vider l’index de ${source.label}`}
                  onClick={() =>
                    run(
                      () => client.indexing.clearSource(source.id),
                      (result) => `${result.removed} document(s) retiré(s) de l’index.`,
                    )
                  }
                >
                  Vider
                </button>
                <button
                  type="button"
                  className="link-button link-button--small"
                  aria-label={`Retirer la source ${source.label}`}
                  onClick={() =>
                    run(() => client.indexing.removeSource(source.id), 'Source retirée.')
                  }
                >
                  Retirer
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="inline-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!folder.trim()) return;
            if (
              await run(
                () => client.indexing.addSource({ kind: 'FOLDER', location: folder.trim() }),
                'Dossier ajouté.',
              )
            ) {
              setFolder('');
            }
          }}
        >
          <label>
            <span>Dossier (chemin complet)</span>
            <input
              value={folder}
              placeholder="/Users/moi/Généalogie/scans"
              onChange={(event) => setFolder(event.target.value)}
            />
          </label>
          <Button type="submit" size="sm" variant="secondary">
            Ajouter le dossier
          </Button>
        </form>
        <form
          className="inline-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!site.trim()) return;
            if (
              await run(
                () =>
                  client.indexing.addSource({
                    kind: 'SITE',
                    mode,
                    location: site.trim(),
                    ...(mode === 'CRAWL' ? { maxDepth: depth } : {}),
                    ...(mode === 'DATAGOUV' ? { resourceFilter } : {}),
                  }),
                'Source ajoutée.',
              )
            ) {
              setSite('');
              setResourceFilter('');
            }
          }}
        >
          <label>
            <span>Type de source en ligne</span>
            <select value={mode} onChange={(event) => setMode(event.target.value)}>
              {NETWORK_MODES.map((item) => (
                <option key={item.mode} value={item.mode}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>
              {mode === 'DATAGOUV' ? 'Jeu de données (adresse ou identifiant)' : 'Adresse'}
            </span>
            <input
              value={site}
              placeholder={currentMode.placeholder}
              onChange={(event) => setSite(event.target.value)}
            />
          </label>
          {mode === 'DATAGOUV' ? (
            <label>
              <span>Ressources dont le nom contient</span>
              <input
                value={resourceFilter}
                placeholder="deces-1985"
                onChange={(event) => setResourceFilter(event.target.value)}
              />
            </label>
          ) : null}
          {mode === 'CRAWL' ? (
            <label>
              <span>Profondeur des liens</span>
              <select value={depth} onChange={(event) => setDepth(Number(event.target.value))}>
                {[0, 1, 2, 3, 4].map((value) => (
                  <option key={value} value={value}>
                    {value === 0 ? 'Page de départ seule' : `${value} niveau(x)`}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <Button type="submit" size="sm" variant="secondary">
            Ajouter la source
          </Button>
        </form>
        {presets.length ? (
          <div className="indexing-presets">
            <span className="settings-hint">Données ouvertes prêtes à l’emploi :</span>
            {presets.map((preset) => (
              <Button
                key={preset.id}
                size="sm"
                variant="secondary"
                title={preset.hint}
                onClick={() => {
                  setMode(preset.mode);
                  setSite(preset.location);
                  setResourceFilter(preset.resourceFilter ?? '');
                  setMessage(preset.hint);
                }}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        ) : null}
      </section>

      <section className="research-section" aria-labelledby="indexing-settings">
        <h4 id="indexing-settings">Réglages</h4>
        <label className="settings-toggle">
          <input
            type="checkbox"
            checked={settings.networkAllowed}
            onChange={(event) =>
              run(() => client.indexing.updateSettings({ networkAllowed: event.target.checked }))
            }
          />
          <span>
            Autoriser l’accès internet pour indexer les sites listés
            <small className="settings-hint">
              Désactivé par défaut. Seuls les sites ci-dessus sont visités (robots.txt respecté) ;
              aucune donnée de votre arbre n’est envoyée.
            </small>
          </span>
        </label>
        <div className="indexing-schedule">
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={settings.scheduleEnabled}
              onChange={(event) =>
                run(() => client.indexing.updateSettings({ scheduleEnabled: event.target.checked }))
              }
            />
            <span>Indexer automatiquement chaque nuit</span>
          </label>
          <label>
            <span>Heure</span>
            <select
              value={settings.scheduleHour}
              onChange={(event) =>
                run(() =>
                  client.indexing.updateSettings({ scheduleHour: Number(event.target.value) }),
                )
              }
            >
              {Array.from({ length: 24 }, (_, hour) => (
                <option key={hour} value={hour}>
                  {String(hour).padStart(2, '0')} h
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="settings-hint">
          GeneoApp doit être ouverte (ou réduite) à cette heure. Application fermée : planifiez la
          commande <code>geneoapp index run</code> (cron, Planificateur de tâches).
        </p>
        <div className="gedcom-panel__actions">
          <Button
            disabled={busy || status.running}
            onClick={() => launch(() => client.indexing.run())}
          >
            {busy || status.running ? 'Indexation en cours…' : 'Indexer maintenant'}
          </Button>
          {status.running ? (
            <Button variant="secondary" onClick={() => run(() => client.indexing.cancel())}>
              Annuler
            </Button>
          ) : null}
        </div>
        {progress ? (
          <div className="indexing-progress" role="status" aria-live="polite">
            <span>
              Source {progress.sourceIndex}/{progress.sourceCount} · {progress.sourceLabel}
              {progress.total ? ` · ${progress.done}/${progress.total}` : ` · ${progress.done}`}
            </span>
            {progress.total ? <progress value={progress.done} max={progress.total} /> : null}
            {progress.current ? <small className="data-id">{progress.current}</small> : null}
          </div>
        ) : null}
        {stats ? (
          <p className="settings-hint">
            {stats.documents} document(s) indexé(s) · {stats.byStatus.OCR ?? 0} lu(s) par OCR ·{' '}
            {stats.byStatus.UNAVAILABLE ?? 0} sans texte
          </p>
        ) : null}
      </section>

      <section className="research-section" aria-labelledby="indexing-runs">
        <h4 id="indexing-runs">Dernières exécutions</h4>
        {runs.length === 0 ? (
          <p className="settings-hint">Aucune indexation pour l’instant.</p>
        ) : (
          <ul className="search-results">
            {runs.map((item) => (
              <li key={item.id}>
                <Badge
                  tone={
                    item.status === 'DONE'
                      ? 'success'
                      : item.status === 'FAILED'
                        ? 'danger'
                        : 'neutral'
                  }
                >
                  {RUN_LABELS[item.status]}
                </Badge>
                <span>
                  {formatDateTime(item.started_at)} · {TRIGGER_LABELS[item.trigger]}
                </span>
                <span className="data-id">
                  {item.source_label ? `${item.source_label} · ` : ''}
                  {item.indexed} indexé(s) · {item.unchanged} inchangé(s) · {item.errors} erreur(s)
                </span>
                {item.message ? <span className="settings-hint">{item.message}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
