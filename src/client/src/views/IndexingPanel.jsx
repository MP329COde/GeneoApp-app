import { useCallback, useEffect, useState } from 'react';
import { Badge, Button } from '../design-system/index.js';

const STATUS_LABELS = { EXTRACTED: 'Texte', OCR: 'OCR', UNAVAILABLE: 'Titre seul' };
const RUN_LABELS = { DONE: 'Terminée', FAILED: 'Échec', RUNNING: 'En cours' };
const TRIGGER_LABELS = { MANUAL: 'manuelle', SCHEDULED: 'planifiée', CLI: 'ligne de commande' };

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

  const { settings, sources, runs } = status;

  return (
    <div className="search-panel indexing-panel">
      <h3>Documents indexés</h3>
      <form
        className="search-panel__form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!query.trim()) return;
          try {
            setHits(await client.indexing.search(query.trim()));
          } catch (searchError) {
            setError(searchError.message);
          }
        }}
      >
        <label className="search-box">
          <span>Rechercher dans les documents</span>
          <input
            value={query}
            placeholder="acte, nom, lieu…"
            onChange={(event) => setQuery(event.target.value)}
          />
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
                {hit.media_id || /^https?:\/\//.test(hit.location) ? (
                  <Button size="sm" variant="secondary" onClick={() => openHit(hit)}>
                    Ouvrir
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )
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
                    {source.kind === 'FOLDER' ? 'Dossier' : 'Site'} · {source.label}
                    <small className="settings-hint"> {source.location}</small>
                  </span>
                </label>
                <span className="data-id">{source.document_count} document(s)</span>
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
                    location: site.trim(),
                    maxDepth: depth,
                  }),
                'Site ajouté.',
              )
            ) {
              setSite('');
            }
          }}
        >
          <label>
            <span>Site d’archives (adresse de départ)</span>
            <input
              value={site}
              placeholder="https://archives.exemple.fr/registres"
              onChange={(event) => setSite(event.target.value)}
            />
          </label>
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
          <Button type="submit" size="sm" variant="secondary">
            Ajouter le site
          </Button>
        </form>
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
            onClick={async () => {
              setBusy(true);
              await run(
                () => client.indexing.run(),
                (result) =>
                  `Indexation terminée : ${result.indexed} nouveau(x), ${result.unchanged} inchangé(s), ${result.skipped} ignoré(s), ${result.errors} erreur(s).${result.message ? ` ${result.message}` : ''}`,
              );
              setBusy(false);
            }}
          >
            {busy || status.running ? 'Indexation en cours…' : 'Indexer maintenant'}
          </Button>
        </div>
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
