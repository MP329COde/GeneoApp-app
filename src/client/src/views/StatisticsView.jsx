import { useEffect, useState } from 'react';
import { Button, useI18n } from '../design-system/index.js';
import { client } from '../api/app-client.js';
import { ErrorNotice, Icon } from '../components/shared.jsx';
import {
  BarList,
  ColumnChart,
  DonutChart,
  Gauge,
  KpiCard,
  RatioBar,
  formatPercent,
} from './stats-charts.jsx';

// Écran Statistiques : chiffres clés, puis des graphiques SVG sans dépendance
// (sexe, naissances par décennie, générations, lieux, noms, complétude,
// sources). Tout vient des endpoints locaux ; un graphique sans données
// explique quoi saisir plutôt que de rester vide.
const COMPLETENESS_KEYS = ['birthDate', 'birthPlace', 'parents', 'sourced'];

function asInsights(response) {
  const value = response?.insights;
  return value && typeof value === 'object' && value.persons ? value : null;
}

function levelOf(score) {
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

function Card({ title, note, wide = false, children, testId }) {
  return (
    <section className={`stat-card${wide ? ' stat-card--wide' : ''}`} data-testid={testId}>
      <h4 className="stat-card__title">{title}</h4>
      {note ? <p className="stat-card__note">{note}</p> : null}
      {children}
    </section>
  );
}

function EmptyChart({ icon, children }) {
  return (
    <p className="stat-empty">
      <span className="stat-empty__icon" aria-hidden="true">
        <Icon name={icon} />
      </span>
      <span>{children}</span>
    </p>
  );
}

export function StatisticsView({ onNavigate }) {
  const { t, locale } = useI18n();
  const [totals, setTotals] = useState(null);
  const [insights, setInsights] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([client.statistics.totals(), client.statistics.insights?.()]).then(
      ([totalsResult, insightsResult]) => {
        if (cancelled) return;
        if (totalsResult.status === 'rejected') {
          setFailed(true);
          return;
        }
        setTotals(totalsResult.value.totals ?? totalsResult.value);
        if (insightsResult.status === 'fulfilled') setInsights(asInsights(insightsResult.value));
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const heading = (
    <>
      <h3>{t('stats.title')}</h3>
      <p className="stat-intro">{t('stats.subtitle')}</p>
    </>
  );

  if (failed) {
    return (
      <div className="statistics">
        {heading}
        <ErrorNotice message={t('stats.error')} />
      </div>
    );
  }
  if (totals === null) {
    return (
      <div className="statistics">
        {heading}
        <p role="status" className="loading-line">
          {t('stats.loading')}
        </p>
      </div>
    );
  }
  if ((totals.persons ?? 0) === 0) {
    return (
      <div className="statistics">
        {heading}
        <div className="stat-blank" data-testid="stats-empty">
          <span className="stat-blank__icon" aria-hidden="true">
            <Icon name="tree" />
          </span>
          <h4>{t('stats.empty.title')}</h4>
          <p>{t('stats.empty.text')}</p>
          {onNavigate ? (
            <Button type="button" onClick={() => onNavigate('tree')}>
              {t('stats.empty.cta')}
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  const number = new Intl.NumberFormat(locale);
  const decimal = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const personTotal = totals.persons;
  const generationCount = insights?.generations.count ?? 0;
  const span = insights?.birthSpan;

  return (
    <div className="statistics">
      {heading}

      <section aria-label={t('stats.kpiTitle')}>
        <dl className="stat-kpis" data-testid="stats-kpis">
          <KpiCard
            icon="person"
            label={t('stats.kpi.persons')}
            value={number.format(personTotal)}
            hint={
              insights ? t('stats.kpi.persons.hint', { count: insights.persons.living }) : undefined
            }
          />
          <KpiCard
            icon="family"
            label={t('stats.kpi.unions')}
            value={number.format(totals.unions ?? 0)}
            hint={t('stats.kpi.unions.hint')}
          />
          {insights ? (
            <KpiCard
              icon="tree"
              label={t('stats.kpi.generations')}
              value={number.format(generationCount)}
              hint={
                generationCount > 1
                  ? t('stats.kpi.generations.hint')
                  : t('stats.kpi.generations.none')
              }
            />
          ) : null}
          {insights ? (
            <KpiCard
              icon="timeline"
              label={t('stats.kpi.span')}
              compact
              value={span ? `${span.from}–${span.to}` : '—'}
              hint={
                span
                  ? t('stats.kpi.span.hint', { count: insights.birthsDated })
                  : t('stats.kpi.span.none')
              }
            />
          ) : null}
          <KpiCard
            icon="event"
            label={t('stats.kpi.events')}
            value={number.format(totals.events ?? 0)}
            hint={t('stats.kpi.events.hint', {
              average: decimal.format((totals.events ?? 0) / personTotal),
            })}
          />
          <KpiCard
            icon="map"
            label={t('stats.kpi.places')}
            value={number.format(totals.places ?? 0)}
            hint={t('stats.kpi.places.hint')}
          />
          <KpiCard
            icon="source"
            label={t('stats.kpi.sources')}
            value={number.format(totals.sources ?? 0)}
            hint={
              insights
                ? t('stats.kpi.sources.hint', {
                    used: insights.evidence.sourcesUsed,
                    total: insights.evidence.sources,
                  })
                : undefined
            }
          />
          <KpiCard
            icon="media"
            label={t('stats.kpi.media')}
            value={number.format(totals.media ?? 0)}
            hint={t('stats.kpi.media.hint')}
          />
        </dl>
      </section>

      {insights ? (
        <div className="stat-grid" data-testid="stats-charts">
          {sexCard(insights)}
          {completenessCard(insights)}
          {decadesCard(insights)}
          {evidenceCard(insights)}
          {generationsCard(insights)}
          {topCard({
            testId: 'stats-places',
            title: t('stats.places.title'),
            note: t('stats.places.note'),
            rows: insights.topPlaces,
            empty: t('stats.places.empty'),
            emptyIcon: 'map',
            countLabel: t('stats.places.count'),
            tableCaption: t('stats.places.title'),
          })}
          {topCard({
            testId: 'stats-surnames',
            title: t('stats.surnames.title'),
            rows: insights.topSurnames,
            empty: t('stats.surnames.empty'),
            emptyIcon: 'person',
            countLabel: t('stats.surnames.count'),
            tableCaption: t('stats.surnames.title'),
          })}
          {topCard({
            testId: 'stats-given-names',
            title: t('stats.givenNames.title'),
            rows: insights.topGivenNames,
            empty: t('stats.givenNames.empty'),
            emptyIcon: 'person',
            countLabel: t('stats.givenNames.count'),
            tableCaption: t('stats.givenNames.title'),
          })}
        </div>
      ) : null}
    </div>
  );

  function sexCard(data) {
    const sexes = [
      { key: 'F', tone: 'f' },
      { key: 'M', tone: 'm' },
      { key: 'U', tone: 'u' },
    ].map(({ key, tone }) => ({
      key,
      tone,
      label: t(`stats.sex.${key}`),
      value: data.persons.bySex[key] ?? 0,
    }));
    const summary = sexes
      .map(
        (segment) =>
          `${segment.label} ${segment.value} (${formatPercent(locale, segment.value / personTotal)})`,
      )
      .join(', ');
    return (
      <Card title={t('stats.sex.title')} testId="stats-sex">
        <DonutChart
          segments={sexes}
          total={data.persons.total}
          centerLabel={t('stats.sex.centerLabel')}
          alt={t('stats.sex.alt', { summary })}
          tableCaption={t('stats.sex.title')}
          headers={[t('stats.table.category'), t('stats.table.count'), t('stats.table.share')]}
        />
      </Card>
    );
  }

  function decadesCard(data) {
    const rows = data.birthsByDecade.map((row) => ({
      key: row.decade,
      label: String(row.decade),
      value: row.count,
      barLabel: t('stats.decades.bar', { decade: String(row.decade), count: row.count }),
    }));
    return (
      <Card
        wide
        title={t('stats.decades.title')}
        note={
          rows.length > 0
            ? t('stats.decades.note', { count: data.birthsDated, total: data.persons.total })
            : undefined
        }
        testId="stats-decades"
      >
        {rows.length > 0 ? (
          <ColumnChart
            rows={rows}
            alt={t('stats.decades.alt', {
              from: rows[0].label,
              to: rows[rows.length - 1].label,
              summary: rows
                .filter((row) => row.value > 0)
                .map((row) => row.barLabel)
                .join(', '),
            })}
            tableCaption={t('stats.decades.title')}
            headers={[t('stats.decades.decade'), t('stats.decades.births')]}
          />
        ) : (
          <EmptyChart icon="timeline">{t('stats.decades.empty')}</EmptyChart>
        )}
      </Card>
    );
  }

  function completenessCard(data) {
    const { completeness } = data;
    const score = completeness.score;
    const level = levelOf(score);
    const weakest = COMPLETENESS_KEYS.filter((key) => completeness[key].percent < 100).sort(
      (a, b) => completeness[a].percent - completeness[b].percent,
    )[0];
    return (
      <Card title={t('stats.completeness.title')} testId="stats-completeness">
        <div className="stat-complete">
          <div className="stat-complete__gauge">
            <Gauge
              percent={score}
              alt={t('stats.completeness.alt', { percent: score })}
              caption={t('stats.completeness.score', { percent: score })}
            />
            <span className={`stat-level stat-level--${level}`}>
              {t(`stats.completeness.level.${level}`)}
            </span>
          </div>
          <div className="stat-complete__rows">
            {COMPLETENESS_KEYS.map((key) => (
              <RatioBar
                key={key}
                have={completeness[key].have}
                total={completeness[key].total}
                label={t(`stats.completeness.${key}`)}
                valueText={`${t('stats.completeness.ratio', {
                  have: completeness[key].have,
                  total: completeness[key].total,
                })} · ${formatPercent(locale, completeness[key].percent / 100)}`}
              />
            ))}
          </div>
        </div>
        <p className="stat-card__next">
          {weakest
            ? t('stats.completeness.next', { action: t(`stats.completeness.next.${weakest}`) })
            : t('stats.completeness.done')}
        </p>
      </Card>
    );
  }

  function evidenceCard(data) {
    const { evidence } = data;
    const rows = [
      {
        key: 'facts',
        label: t('stats.evidence.facts'),
        hint: t('stats.evidence.factsHint'),
        have: evidence.factsCited,
        total: evidence.facts,
      },
      {
        key: 'sources',
        label: t('stats.evidence.sources'),
        hint: t('stats.evidence.sourcesHint'),
        have: evidence.sourcesUsed,
        total: evidence.sources,
      },
    ];
    return (
      <Card title={t('stats.evidence.title')} testId="stats-evidence">
        {evidence.facts === 0 && evidence.sources === 0 ? (
          <EmptyChart icon="source">{t('stats.evidence.empty')}</EmptyChart>
        ) : (
          <>
            <div className="stat-ratios">
              {rows.map((row) => (
                <RatioBar
                  key={row.key}
                  have={row.have}
                  total={row.total}
                  label={row.label}
                  hint={row.hint}
                  valueText={`${t('stats.evidence.ratio', {
                    have: row.have,
                    total: row.total,
                  })}${row.total > 0 ? ` · ${formatPercent(locale, row.have / row.total)}` : ''}`}
                />
              ))}
            </div>
            <ul className="stat-legend stat-legend--inline">
              <li>
                <span className="stat-swatch stat-swatch--solid" aria-hidden="true" />
                {t('stats.evidence.cited')}
              </li>
              <li>
                <span className="stat-swatch stat-swatch--hatch" aria-hidden="true" />
                {t('stats.evidence.uncited')}
              </li>
            </ul>
          </>
        )}
        {onNavigate ? (
          <Button type="button" size="sm" variant="secondary" onClick={() => onNavigate('sources')}>
            {t('stats.evidence.open')}
          </Button>
        ) : null}
        <p className="gds-visually-hidden">
          {rows
            .map((row) =>
              t('stats.evidence.alt', { label: row.label, have: row.have, total: row.total }),
            )
            .join(' ')}
        </p>
      </Card>
    );
  }

  function generationsCard(data) {
    const perGeneration = data.generations.perGeneration;
    const rows = perGeneration.map((count, index) => ({
      key: index,
      label: t('stats.generations.row', { number: index + 1 }),
      value: count,
    }));
    return (
      <Card
        title={t('stats.generations.title')}
        note={rows.length > 1 ? t('stats.generations.note') : undefined}
        testId="stats-generations"
      >
        {rows.length === 0 ? (
          <EmptyChart icon="tree">{t('stats.generations.empty')}</EmptyChart>
        ) : (
          <>
            <BarList
              ordered={false}
              rows={rows}
              tableCaption={t('stats.generations.title')}
              headers={[t('stats.table.category'), t('stats.generations.people')]}
            />
            {rows.length === 1 ? (
              <p className="stat-card__note">{t('stats.generations.single')}</p>
            ) : null}
          </>
        )}
      </Card>
    );
  }

  function topCard({ title, note, rows, empty, emptyIcon, countLabel, tableCaption, testId }) {
    return (
      <Card title={title} note={note} testId={testId}>
        {rows.length === 0 ? (
          <EmptyChart icon={emptyIcon}>{empty}</EmptyChart>
        ) : (
          <BarList
            rows={rows.map((row) => ({ key: row.name, label: row.name, value: row.count }))}
            tableCaption={tableCaption}
            headers={[t('stats.table.category'), countLabel]}
          />
        )}
      </Card>
    );
  }
}
