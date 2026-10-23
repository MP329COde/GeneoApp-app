import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, useTranslation } from '../design-system/index.js';

// Libellés indexés par code technique, traduits via l'i18n : un code inconnu
// retombe sur son libellé brut, jamais sur une chaîne vide.
const STATUS_KEYS = {
  EXTRACTED: 'indexing.status.extracted',
  OCR: 'indexing.status.ocr',
  UNAVAILABLE: 'indexing.status.unavailable',
};
const RUN_KEYS = {
  DONE: 'indexing.run.done',
  FAILED: 'indexing.run.failed',
  RUNNING: 'indexing.run.running',
};
const TRIGGER_KEYS = {
  MANUAL: 'indexing.trigger.manual',
  SCHEDULED: 'indexing.trigger.scheduled',
  CLI: 'indexing.trigger.cli',
};
const MODE_KEYS = {
  CRAWL: 'indexing.mode.crawl',
  DIRECT: 'indexing.mode.direct',
  DATAGOUV: 'indexing.mode.datagouv',
};
const OUTCOME_TONES = { DONE: 'success', PARTIAL: 'neutral', FAILED: 'danger', SKIPPED: 'neutral' };
const OUTCOME_KEYS = {
  DONE: 'indexing.outcome.done',
  PARTIAL: 'indexing.outcome.partial',
  FAILED: 'indexing.outcome.failed',
  SKIPPED: 'indexing.outcome.skipped',
};
const NETWORK_MODES = [
  {
    mode: 'CRAWL',
    labelKey: 'indexing.network.crawl',
    placeholder: 'https://archives.exemple.fr/registres',
  },
  {
    mode: 'DIRECT',
    labelKey: 'indexing.network.direct',
    placeholder: 'https://exemple.fr/donnees/registre.csv',
  },
  {
    mode: 'DATAGOUV',
    labelKey: 'indexing.network.datagouv',
    placeholder: 'https://www.data.gouv.fr/fr/datasets/…',
  },
];
const PAGE_SIZE = 25;

function formatDateTime(value, locale) {
  return value ? new Date(value).toLocaleString(locale) : '—';
}

// Documents indexés (ADR 0011) : recherche plein texte d'abord, puis sources
// (dossiers, sites), réglages de planification et journal.
export function IndexingPanel({ client }) {
  const { t, locale } = useTranslation();
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

  // Résumé d'une exécution : chaque compteur a son propre pluriel, la phrase
  // d'assemblage est traduite à part.
  const runSummary = (result) => {
    // Dans la phrase, l'état s'accorde en minuscules (« Indexation terminée ») ;
    // le journal des dernières exécutions garde la majuscule (étiquette isolée).
    const status =
      result.status === 'DONE'
        ? t('indexing.runSummary.status.done', 'terminée')
        : t('indexing.runSummary.status.interrupted', 'interrompue');
    const counts = t(
      'indexing.runSummary.counts',
      {
        indexed: t(
          'indexing.runSummary.indexed',
          { count: result.indexed },
          `${result.indexed} nouveau(x)`,
        ),
        unchanged: t(
          'indexing.runSummary.unchanged',
          { count: result.unchanged },
          `${result.unchanged} inchangé(s)`,
        ),
        skipped: t(
          'indexing.runSummary.skipped',
          { count: result.skipped },
          `${result.skipped} ignoré(s)`,
        ),
        errors: t(
          'indexing.runSummary.errors',
          { count: result.errors },
          `${result.errors} erreur(s)`,
        ),
      },
      '{indexed}, {unchanged}, {skipped}, {errors}',
    );
    const summary = t(
      'indexing.runSummary',
      { status, counts },
      `Indexation ${status} : ${counts}.`,
    );
    return result.message ? `${summary} ${result.message}` : summary;
  };

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
        {t('indexing.loading', 'Chargement…')}
      </p>
    );
  }

  const { settings, sources, runs, progress, stats, presets = [] } = status;
  const currentMode = NETWORK_MODES.find((item) => item.mode === mode);

  return (
    <div className="search-panel indexing-panel">
      <h3>{t('indexing.title', 'Documents indexés')}</h3>
      <form
        className="search-panel__form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!query.trim()) return;
          await searchAt(0);
        }}
      >
        <label className="search-box">
          <span>{t('indexing.search.label', 'Rechercher dans les documents')}</span>
          <input
            value={query}
            placeholder={t(
              'indexing.search.placeholder',
              'acte, nom, lieu… « "jean baptiste" -paris »',
            )}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label>
          <span>{t('indexing.search.source', 'Source')}</span>
          <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
            <option value="">{t('indexing.search.allSources', 'Toutes')}</option>
            {sources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.label}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" size="sm">
          {t('indexing.search.submit', 'Chercher')}
        </Button>
      </form>
      {hits ? (
        hits.length === 0 ? (
          <p className="notice">
            {t('indexing.search.noResult', { query }, `Aucun document ne contient « ${query} ».`)}
          </p>
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
                <Badge tone="neutral">
                  {t(
                    STATUS_KEYS[hit.text_status] ?? 'indexing.status.unavailable',
                    hit.text_status,
                  )}
                </Badge>
                <Button size="sm" variant="secondary" onClick={() => showPreview(hit)}>
                  {preview?.id === hit.id
                    ? t('indexing.hit.hide', 'Masquer')
                    : t('indexing.hit.preview', 'Aperçu')}
                </Button>
                {hit.media_id || /^https?:\/\//.test(hit.location) ? (
                  <Button size="sm" variant="secondary" onClick={() => openHit(hit)}>
                    {t('indexing.hit.open', 'Ouvrir')}
                  </Button>
                ) : null}
                {preview?.id === hit.id ? (
                  <pre className="indexing-preview">
                    {preview.text || t('indexing.hit.noText', 'Aucun texte extrait.')}
                  </pre>
                ) : null}
              </li>
            ))}
          </ul>
        )
      ) : null}
      {page && page.total > PAGE_SIZE ? (
        <div className="gedcom-panel__actions">
          <span className="data-id">
            {t(
              'indexing.pagination.summary',
              {
                start: page.offset + 1,
                end: Math.min(page.offset + PAGE_SIZE, page.total),
                total: page.total,
              },
              `${page.offset + 1}–${Math.min(page.offset + PAGE_SIZE, page.total)} sur ${page.total}`,
            )}
          </span>
          <Button
            size="sm"
            variant="secondary"
            disabled={page.offset === 0}
            onClick={() => searchAt(Math.max(0, page.offset - PAGE_SIZE))}
          >
            {t('indexing.pagination.previous', 'Précédents')}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={page.offset + PAGE_SIZE >= page.total}
            onClick={() => searchAt(page.offset + PAGE_SIZE)}
          >
            {t('indexing.pagination.next', 'Suivants')}
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
        <h4 id="indexing-sources">
          {t('indexing.sources.title', { count: sources.length }, `Sources (${sources.length})`)}
        </h4>
        {sources.length === 0 ? (
          <p className="settings-hint">
            {t(
              'indexing.sources.empty',
              'Ajoutez un dossier (scans, PDF, notes) ou un site d’archives à indexer.',
            )}
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
                    {source.kind === 'FOLDER'
                      ? t('indexing.source.folder', 'Dossier')
                      : t(MODE_KEYS[source.mode] ?? 'indexing.mode.crawl', source.mode)}{' '}
                    · {source.label}
                    <small className="settings-hint">
                      {' '}
                      {source.location}
                      {source.resource_filter
                        ? ` · ${t(
                            'indexing.source.resourceFilter',
                            { filter: source.resource_filter },
                            `filtre « ${source.resource_filter} »`,
                          )}`
                        : ''}
                    </small>
                    {source.last_message ? (
                      <small className="settings-hint"> {source.last_message}</small>
                    ) : null}
                  </span>
                </label>
                {source.last_status ? (
                  <Badge tone={OUTCOME_TONES[source.last_status]}>
                    {t(
                      OUTCOME_KEYS[source.last_status] ?? 'indexing.outcome.partial',
                      source.last_status,
                    )}
                  </Badge>
                ) : null}
                <span className="data-id">
                  {t(
                    'indexing.source.documentCount',
                    { count: source.document_count },
                    `${source.document_count} document(s)`,
                  )}
                </span>
                <button
                  type="button"
                  className="link-button link-button--small"
                  disabled={busy || status.running}
                  aria-label={t(
                    'indexing.source.indexNowLabel',
                    { label: source.label },
                    `Indexer maintenant ${source.label}`,
                  )}
                  onClick={() => launch(() => client.indexing.runSource(source.id))}
                >
                  {t('indexing.source.index', 'Indexer')}
                </button>
                <button
                  type="button"
                  className="link-button link-button--small"
                  disabled={busy || status.running}
                  aria-label={t(
                    'indexing.source.clearLabel',
                    { label: source.label },
                    `Vider l’index de ${source.label}`,
                  )}
                  onClick={() =>
                    run(
                      () => client.indexing.clearSource(source.id),
                      (result) =>
                        t(
                          'indexing.source.cleared',
                          { count: result.removed },
                          `${result.removed} document(s) retiré(s) de l’index.`,
                        ),
                    )
                  }
                >
                  {t('indexing.source.clear', 'Vider')}
                </button>
                <button
                  type="button"
                  className="link-button link-button--small"
                  aria-label={t(
                    'indexing.source.removeLabel',
                    { label: source.label },
                    `Retirer la source ${source.label}`,
                  )}
                  onClick={() =>
                    run(
                      () => client.indexing.removeSource(source.id),
                      t('indexing.source.removed', 'Source retirée.'),
                    )
                  }
                >
                  {t('indexing.source.remove', 'Retirer')}
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
                t('indexing.source.folderAdded', 'Dossier ajouté.'),
              )
            ) {
              setFolder('');
            }
          }}
        >
          <label>
            <span>{t('indexing.source.folderPath', 'Dossier (chemin complet)')}</span>
            <input
              value={folder}
              placeholder={t('indexing.source.folderPlaceholder', '/Users/moi/Généalogie/scans')}
              onChange={(event) => setFolder(event.target.value)}
            />
          </label>
          <Button type="submit" size="sm" variant="secondary">
            {t('indexing.source.addFolder', 'Ajouter le dossier')}
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
                t('indexing.source.added', 'Source ajoutée.'),
              )
            ) {
              setSite('');
              setResourceFilter('');
            }
          }}
        >
          <label>
            <span>{t('indexing.source.onlineType', 'Type de source en ligne')}</span>
            <select value={mode} onChange={(event) => setMode(event.target.value)}>
              {NETWORK_MODES.map((item) => (
                <option key={item.mode} value={item.mode}>
                  {t(item.labelKey, item.mode)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>
              {mode === 'DATAGOUV'
                ? t('indexing.source.dataset', 'Jeu de données (adresse ou identifiant)')
                : t('indexing.source.address', 'Adresse')}
            </span>
            <input
              value={site}
              placeholder={currentMode.placeholder}
              onChange={(event) => setSite(event.target.value)}
            />
          </label>
          {mode === 'DATAGOUV' ? (
            <label>
              <span>{t('indexing.source.resourceName', 'Ressources dont le nom contient')}</span>
              <input
                value={resourceFilter}
                placeholder="deces-1985"
                onChange={(event) => setResourceFilter(event.target.value)}
              />
            </label>
          ) : null}
          {mode === 'CRAWL' ? (
            <label>
              <span>{t('indexing.source.linkDepth', 'Profondeur des liens')}</span>
              <select value={depth} onChange={(event) => setDepth(Number(event.target.value))}>
                {[0, 1, 2, 3, 4].map((value) => (
                  <option key={value} value={value}>
                    {value === 0
                      ? t('indexing.source.startPageOnly', 'Page de départ seule')
                      : t('indexing.source.levels', { count: value }, `${value} niveau(x)`)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <Button type="submit" size="sm" variant="secondary">
            {t('indexing.source.add', 'Ajouter la source')}
          </Button>
        </form>
        {presets.length ? (
          <div className="indexing-presets">
            <span className="settings-hint">
              {t('indexing.presets.hint', 'Données ouvertes prêtes à l’emploi :')}
            </span>
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
        <h4 id="indexing-settings">{t('indexing.settings.title', 'Réglages')}</h4>
        <label className="settings-toggle">
          <input
            type="checkbox"
            checked={settings.networkAllowed}
            onChange={(event) =>
              run(() => client.indexing.updateSettings({ networkAllowed: event.target.checked }))
            }
          />
          <span>
            {t(
              'indexing.settings.networkAllowed',
              'Autoriser l’accès internet pour indexer les sites listés',
            )}
            <small className="settings-hint">
              {t(
                'indexing.settings.networkAllowedHint',
                'Désactivé par défaut. Seuls les sites ci-dessus sont visités (robots.txt respecté) ; aucune donnée de votre arbre n’est envoyée.',
              )}
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
            <span>
              {t('indexing.settings.scheduleEnabled', 'Indexer automatiquement chaque nuit')}
            </span>
          </label>
          <label>
            <span>{t('indexing.settings.hour', 'Heure')}</span>
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
          {t(
            'indexing.settings.scheduleHint',
            'GeneoApp doit être ouverte (ou réduite) à cette heure. Application fermée : planifiez la commande',
          )}{' '}
          <code>geneoapp index run</code>{' '}
          {t('indexing.settings.scheduleHintEnd', '(cron, Planificateur de tâches).')}
        </p>
        <div className="gedcom-panel__actions">
          <Button
            disabled={busy || status.running}
            onClick={() => launch(() => client.indexing.run())}
          >
            {busy || status.running
              ? t('indexing.settings.running', 'Indexation en cours…')
              : t('indexing.settings.indexNow', 'Indexer maintenant')}
          </Button>
          {status.running ? (
            <Button variant="secondary" onClick={() => run(() => client.indexing.cancel())}>
              {t('indexing.settings.cancel', 'Annuler')}
            </Button>
          ) : null}
        </div>
        {progress ? (
          <div className="indexing-progress" role="status" aria-live="polite">
            <span>
              {t(
                'indexing.progress.source',
                { index: progress.sourceIndex, count: progress.sourceCount },
                `Source ${progress.sourceIndex}/${progress.sourceCount}`,
              )}{' '}
              · {progress.sourceLabel}
              {progress.total ? ` · ${progress.done}/${progress.total}` : ` · ${progress.done}`}
            </span>
            {progress.total ? <progress value={progress.done} max={progress.total} /> : null}
            {progress.current ? <small className="data-id">{progress.current}</small> : null}
          </div>
        ) : null}
        {stats ? (
          <p className="settings-hint">
            {t(
              'indexing.stats.summary',
              {
                documents: t(
                  'indexing.stats.documents',
                  { count: stats.documents },
                  `${stats.documents} document(s) indexé(s)`,
                ),
                ocr: t(
                  'indexing.stats.ocr',
                  { count: stats.byStatus.OCR ?? 0 },
                  `${stats.byStatus.OCR ?? 0} lu(s) par OCR`,
                ),
                unavailable: t(
                  'indexing.stats.unavailable',
                  { count: stats.byStatus.UNAVAILABLE ?? 0 },
                  `${stats.byStatus.UNAVAILABLE ?? 0} sans texte`,
                ),
              },
              '{documents} · {ocr} · {unavailable}',
            )}
          </p>
        ) : null}
      </section>

      <section className="research-section" aria-labelledby="indexing-runs">
        <h4 id="indexing-runs">{t('indexing.runs.title', 'Dernières exécutions')}</h4>
        {runs.length === 0 ? (
          <p className="settings-hint">
            {t('indexing.runs.empty', 'Aucune indexation pour l’instant.')}
          </p>
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
                  {t(RUN_KEYS[item.status] ?? 'indexing.run.failed', item.status)}
                </Badge>
                <span>
                  {formatDateTime(item.started_at, locale)} ·{' '}
                  {t(TRIGGER_KEYS[item.trigger] ?? 'indexing.trigger.manual', item.trigger)}
                </span>
                <span className="data-id">
                  {item.source_label ? `${item.source_label} · ` : ''}
                  {t(
                    'indexing.runs.counts',
                    {
                      indexed: t(
                        'indexing.runs.indexed',
                        { count: item.indexed },
                        `${item.indexed} indexé(s)`,
                      ),
                      unchanged: t(
                        'indexing.runs.unchanged',
                        { count: item.unchanged },
                        `${item.unchanged} inchangé(s)`,
                      ),
                      errors: t(
                        'indexing.runs.errors',
                        { count: item.errors },
                        `${item.errors} erreur(s)`,
                      ),
                    },
                    '{indexed} · {unchanged} · {errors}',
                  )}
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
