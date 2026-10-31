import { useEffect, useState } from 'react';
import { Button, useI18n } from '../design-system/index.js';
import { client } from '../api/app-client.js';
import { ErrorNotice, Icon } from '../components/shared.jsx';
import { Gauge } from './stats-charts.jsx';

// Tableau de bord local : l'état de l'arbre actif en un coup d'œil, et ce qui
// demande l'attention de l'utilisateur (erreurs certaines, situations
// inhabituelles, doublons probables, contradictions à trancher, recherches en
// cours). Tout est calculé localement ; chaque carte mène à l'écran concerné.
// Un indicateur indisponible n'empêche jamais l'affichage des autres.
async function settled(promise) {
  try {
    return { value: await promise };
  } catch (error) {
    return { error };
  }
}

export function DashboardView({ onNavigate }) {
  const { t, locale } = useI18n();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [totals, tree, consistency, duplicates, conflicts, research, insights] =
        await Promise.all([
          settled(client.statistics.totals()),
          settled(client.trees?.active?.() ?? Promise.resolve(null)),
          settled(client.graph.consistency()),
          settled(client.search.duplicates(1)),
          settled(client.assertions.conflicts()),
          settled(client.research.list()),
          settled(client.statistics.insights?.() ?? Promise.resolve(null)),
        ]);
      if (cancelled) return;
      if (totals.error) {
        setError(totals.error.message);
        return;
      }
      const openResearch = (research.value ?? []).filter(
        (item) => item.status !== 'DONE' && item.status !== 'ABANDONED',
      );
      setData({
        totals: totals.value.totals ?? totals.value,
        treeName: tree.value?.name ?? null,
        certain: consistency.value?.counts?.certain ?? null,
        unusual: consistency.value?.counts?.unusual ?? null,
        duplicates: duplicates.value
          ? (duplicates.value.total ?? duplicates.value.length ?? 0)
          : null,
        conflicts: conflicts.value ? conflicts.value.length : null,
        completeness: insights.value?.insights?.completeness?.score ?? null,
        hasPeople: (totals.value.totals ?? totals.value).persons > 0,
        openResearch: research.value ? openResearch.length : null,
        pendingTasks: research.value
          ? openResearch.reduce(
              (sum, item) =>
                sum + Math.max(0, (item.task_count ?? 0) - (item.done_task_count ?? 0)),
              0,
            )
          : null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <ErrorNotice message={error} />;
  if (!data) {
    return (
      <p role="status" className="loading-line">
        {t('dashboard.loading', 'Chargement du tableau de bord…')}
      </p>
    );
  }

  const attention = [
    {
      key: 'certain',
      value: data.certain,
      tone: 'danger',
      icon: 'warning',
      view: 'consistency',
      label: t('dashboard.certain', 'Erreurs certaines à corriger'),
    },
    {
      key: 'unusual',
      value: data.unusual,
      tone: 'warning',
      icon: 'timeline',
      view: 'consistency',
      label: t('dashboard.unusual', 'Situations inhabituelles à vérifier'),
    },
    {
      key: 'duplicates',
      value: data.duplicates,
      tone: 'warning',
      icon: 'duplicate',
      view: 'duplicates',
      label: t('dashboard.duplicates', 'Doublons probables'),
    },
    {
      key: 'conflicts',
      value: data.conflicts,
      tone: 'warning',
      icon: 'notebook',
      view: 'annotations',
      label: t('dashboard.conflicts', 'Contradictions à trancher'),
    },
    {
      key: 'research',
      value: data.openResearch,
      tone: 'neutral',
      icon: 'history',
      view: 'notebook',
      label: t('dashboard.research', 'Recherches en cours'),
      detail:
        data.pendingTasks === null
          ? null
          : t('dashboard.pendingTasks', { count: data.pendingTasks }, '{count} tâche(s) à faire'),
    },
  ];
  const counts = [
    ['persons', t('dashboard.persons', 'Personnes'), 'person'],
    ['unions', t('dashboard.families', 'Familles'), 'family'],
    ['events', t('dashboard.events', 'Événements'), 'event'],
    ['places', t('dashboard.places', 'Lieux'), 'map'],
    ['sources', t('dashboard.sources', 'Sources'), 'source'],
    ['media', t('dashboard.media', 'Documents'), 'media'],
  ];
  const number = new Intl.NumberFormat(locale);
  const visible = attention.filter((item) => item.value !== null);
  const toReview = visible
    .filter((item) => item.key !== 'research')
    .reduce((sum, item) => sum + item.value, 0);
  const statusOf = (item) => {
    if (item.key !== 'research' && item.value === 0) return ['ok', t('dashboard.statusOk')];
    if (item.tone === 'danger') return ['danger', t('dashboard.statusAlert')];
    if (item.tone === 'warning') return ['warning', t('dashboard.statusReview')];
    return ['neutral', t('dashboard.statusInfo')];
  };
  const actions = [
    ['tree', 'tree', t('dashboard.openTree', 'Ouvrir l’arbre'), t('dashboard.openTreeHint')],
    ['search', 'search', t('dashboard.search', 'Rechercher'), t('dashboard.searchHint')],
    [
      'gedcom',
      'file',
      t('dashboard.importExport', 'Importer / exporter'),
      t('dashboard.importExportHint'),
    ],
    ['statistics', 'stats', t('dashboard.statistics'), t('dashboard.statisticsHint')],
    ['backups', 'backup', t('dashboard.backups', 'Sauvegardes'), t('dashboard.backupsHint')],
  ];

  return (
    <div className="dashboard">
      <header className="dash-hero">
        <div>
          <h3>
            {data.treeName
              ? t('dashboard.titleNamed', { name: data.treeName }, 'Tableau de bord — {name}')
              : t('dashboard.title', 'Tableau de bord')}
          </h3>
          <p className="dash-hero__lead">{t('dashboard.welcome')}</p>
        </div>
        <p className="notice dash-hero__local">
          <Icon name="offline" />{' '}
          {t('dashboard.local', 'Données stockées sur cet appareil uniquement.')}
        </p>
      </header>

      {!data.hasPeople ? (
        <section className="dash-start" aria-labelledby="dashboard-start">
          <h4 id="dashboard-start">{t('dashboard.emptyTitle')}</h4>
          <p>{t('dashboard.emptyText')}</p>
          <div className="dashboard__actions dashboard__actions--row">
            <Button type="button" onClick={() => onNavigate('tree')}>
              {t('dashboard.openTree', 'Ouvrir l’arbre')}
            </Button>
            <Button type="button" variant="secondary" onClick={() => onNavigate('gedcom')}>
              {t('dashboard.importExport', 'Importer / exporter')}
            </Button>
          </div>
        </section>
      ) : null}

      <section aria-labelledby="dashboard-counts">
        <h4 id="dashboard-counts" className="dash-section-title">
          {t('dashboard.countsTitle', 'Contenu de l’arbre')}
        </h4>
        <dl className="dashboard__counts">
          {counts.map(([key, label, icon]) => (
            <div key={key}>
              <dt>
                <span className="dash-count-icon" aria-hidden="true">
                  <Icon name={icon} />
                </span>
                {label}
              </dt>
              <dd>{number.format(data.totals[key] ?? 0)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="dash-columns">
        <section aria-labelledby="dashboard-attention" className="dash-main">
          <div className="dash-section-head">
            <h4 id="dashboard-attention" className="dash-section-title">
              {t('dashboard.attentionTitle', 'À surveiller')}
            </h4>
            {toReview > 0 ? (
              <span className="dash-pill dash-pill--warning">
                {t('dashboard.itemsToReview', { count: toReview })}
              </span>
            ) : null}
          </div>
          <p className="dash-hint">{t('dashboard.attentionHint')}</p>
          <ul className="dashboard__cards">
            {visible.map((item) => {
              const [status, statusLabel] = statusOf(item);
              const actionable = item.value > 0 || item.key === 'research';
              return (
                <li
                  key={item.key}
                  data-testid={`dashboard-${item.key}`}
                  className={`dash-card dash-card--${status}${actionable ? ' dash-card--link' : ''}`}
                >
                  <span className="dash-card__icon" aria-hidden="true">
                    <Icon name={item.icon} />
                  </span>
                  <span className="dash-card__count">{item.value}</span>
                  <span className="dash-card__body">
                    <span className="dash-card__label">{item.label}</span>
                    <span className="dash-card__meta">
                      <span className={`dash-pill dash-pill--${status}`}>{statusLabel}</span>
                      {item.detail ? <span className="data-id">{item.detail}</span> : null}
                    </span>
                  </span>
                  {actionable ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => onNavigate(item.view)}
                    >
                      {t('dashboard.open', 'Ouvrir')}
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {visible.every((item) => item.value === 0) ? (
            <p className="verification__empty">
              {t('dashboard.allClear', 'Rien à signaler : aucune anomalie détectée.')}
            </p>
          ) : null}
        </section>

        <div className="dash-side">
          {data.completeness !== null && data.hasPeople ? (
            <section className="dash-health" aria-labelledby="dashboard-health">
              <h4 id="dashboard-health" className="dash-section-title">
                {t('dashboard.healthTitle')}
              </h4>
              <Gauge
                percent={data.completeness}
                alt={`${t('dashboard.healthText')} : ${t('dashboard.healthScore', { percent: data.completeness })}`}
                caption={t('dashboard.healthScore', { percent: data.completeness })}
              />
              <p className="dash-hint">{t('dashboard.healthText')}</p>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => onNavigate('statistics')}
              >
                {t('dashboard.healthLink')}
              </Button>
            </section>
          ) : null}

          <section aria-labelledby="dashboard-actions">
            <h4 id="dashboard-actions" className="dash-section-title">
              {t('dashboard.actionsTitle', 'Actions rapides')}
            </h4>
            <div className="dashboard__actions">
              {actions.map(([view, icon, label, hint], index) => (
                <button
                  key={view}
                  type="button"
                  className={`dash-action${index === 0 ? ' dash-action--primary' : ''}`}
                  aria-describedby={`dashboard-action-${view}`}
                  onClick={() => onNavigate(view)}
                >
                  <span className="dash-action__icon" aria-hidden="true">
                    <Icon name={icon} />
                  </span>
                  <span className="dash-action__label">{label}</span>
                  <span
                    id={`dashboard-action-${view}`}
                    className="dash-action__hint"
                    aria-hidden="true"
                  >
                    {hint}
                  </span>
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
