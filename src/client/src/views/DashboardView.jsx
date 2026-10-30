import { useEffect, useState } from 'react';
import { Badge, Button, useTranslation } from '../design-system/index.js';
import { client } from '../api/app-client.js';
import { ErrorNotice } from '../components/shared.jsx';

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
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [totals, tree, consistency, duplicates, conflicts, research] = await Promise.all([
        settled(client.statistics.totals()),
        settled(client.trees?.active?.() ?? Promise.resolve(null)),
        settled(client.graph.consistency()),
        settled(client.search.duplicates(1)),
        settled(client.assertions.conflicts()),
        settled(client.research.list()),
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
      view: 'consistency',
      label: t('dashboard.certain', 'Erreurs certaines à corriger'),
    },
    {
      key: 'unusual',
      value: data.unusual,
      tone: 'warning',
      view: 'consistency',
      label: t('dashboard.unusual', 'Situations inhabituelles à vérifier'),
    },
    {
      key: 'duplicates',
      value: data.duplicates,
      tone: 'warning',
      view: 'duplicates',
      label: t('dashboard.duplicates', 'Doublons probables'),
    },
    {
      key: 'conflicts',
      value: data.conflicts,
      tone: 'warning',
      view: 'annotations',
      label: t('dashboard.conflicts', 'Contradictions à trancher'),
    },
    {
      key: 'research',
      value: data.openResearch,
      tone: 'neutral',
      view: 'notebook',
      label: t('dashboard.research', 'Recherches en cours'),
      detail:
        data.pendingTasks === null
          ? null
          : t('dashboard.pendingTasks', { count: data.pendingTasks }, '{count} tâche(s) à faire'),
    },
  ];
  const counts = [
    ['persons', t('dashboard.persons', 'Personnes')],
    ['unions', t('dashboard.families', 'Familles')],
    ['events', t('dashboard.events', 'Événements')],
    ['places', t('dashboard.places', 'Lieux')],
    ['sources', t('dashboard.sources', 'Sources')],
    ['media', t('dashboard.media', 'Documents')],
  ];

  return (
    <div className="dashboard">
      <h3>
        {data.treeName
          ? t('dashboard.titleNamed', { name: data.treeName }, 'Tableau de bord — {name}')
          : t('dashboard.title', 'Tableau de bord')}
      </h3>
      <p className="notice">
        {t('dashboard.local', 'Données stockées sur cet appareil uniquement.')}
      </p>

      <section aria-labelledby="dashboard-counts">
        <h4 id="dashboard-counts">{t('dashboard.countsTitle', 'Contenu de l’arbre')}</h4>
        <dl className="dashboard__counts">
          {counts.map(([key, label]) => (
            <div key={key}>
              <dt>{label}</dt>
              <dd>{data.totals[key] ?? 0}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="dashboard-attention">
        <h4 id="dashboard-attention">{t('dashboard.attentionTitle', 'À surveiller')}</h4>
        <ul className="dashboard__cards">
          {attention
            .filter((item) => item.value !== null)
            .map((item) => (
              <li key={item.key} data-testid={`dashboard-${item.key}`}>
                <Badge tone={item.value > 0 ? item.tone : 'success'}>{item.value}</Badge>{' '}
                <span>{item.label}</span>
                {item.detail ? <span className="data-id"> · {item.detail}</span> : null}
                {item.value > 0 || item.key === 'research' ? (
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
            ))}
        </ul>
        {attention.every((item) => item.value === 0 || item.value === null) ? (
          <p className="verification__empty">
            {t('dashboard.allClear', 'Rien à signaler : aucune anomalie détectée.')}
          </p>
        ) : null}
      </section>

      <section aria-labelledby="dashboard-actions">
        <h4 id="dashboard-actions">{t('dashboard.actionsTitle', 'Actions rapides')}</h4>
        <div className="dashboard__actions">
          <Button type="button" onClick={() => onNavigate('tree')}>
            {t('dashboard.openTree', 'Ouvrir l’arbre')}
          </Button>
          <Button type="button" variant="secondary" onClick={() => onNavigate('search')}>
            {t('dashboard.search', 'Rechercher')}
          </Button>
          <Button type="button" variant="secondary" onClick={() => onNavigate('gedcom')}>
            {t('dashboard.importExport', 'Importer / exporter')}
          </Button>
          <Button type="button" variant="secondary" onClick={() => onNavigate('backups')}>
            {t('dashboard.backups', 'Sauvegardes')}
          </Button>
        </div>
      </section>
    </div>
  );
}
