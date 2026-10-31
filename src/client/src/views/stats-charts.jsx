import { useEffect, useId, useRef, useState } from 'react';
import { useI18n } from '../design-system/index.js';
import { Icon } from '../components/shared.jsx';

// Graphiques SVG « maison » de l'écran Statistiques : aucune dépendance, des
// couleurs uniquement issues des tokens (classes CSS), et pour chaque
// graphique un équivalent textuel : libellés et valeurs écrits à l'écran, un
// intitulé court pour les lecteurs d'écran et un tableau de données masqué
// visuellement. La couleur n'est jamais seule à porter l'information.

export function formatPercent(locale, ratio) {
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(
    ratio,
  );
}

/** Largeur réelle du conteneur, pour que le texte du SVG garde sa taille. */
function useContainerWidth(fallback) {
  const ref = useRef(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.round(entry.contentRect.width);
      if (next > 0) setWidth(next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/** Tableau de données équivalent au graphique, masqué visuellement. */
export function ChartDataTable({ caption, headers, rows }) {
  return (
    <table className="gds-visually-hidden">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {headers.map((header) => (
            <th key={header} scope="col">
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row[0]}>
            {row.map((cell, index) => (
              <td key={index}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Carte de chiffre clé : icône, grand chiffre en serif, libellé et explication. */
export function KpiCard({ icon, label, value, hint, testId, compact = false }) {
  return (
    <div className="stat-kpi" data-testid={testId}>
      <dt className="stat-kpi__label">
        <span className="stat-kpi__icon" aria-hidden="true">
          <Icon name={icon} />
        </span>
        {label}
      </dt>
      <dd className={`stat-kpi__value${compact ? ' stat-kpi__value--compact' : ''}`}>{value}</dd>
      {hint ? <dd className="stat-kpi__hint">{hint}</dd> : null}
    </div>
  );
}

const DONUT_RADIUS = 54;
const DONUT_LENGTH = 2 * Math.PI * DONUT_RADIUS;

/**
 * Anneau de répartition. `segments` : { key, label, value, tone } ; la légende
 * écrite (libellé, nombre, part) garantit que la couleur n'est pas seule.
 */
export function DonutChart({ segments, total, centerLabel, alt, tableCaption, headers }) {
  const { locale } = useI18n();
  const sum = segments.reduce((acc, segment) => acc + segment.value, 0);
  let offset = 0;
  return (
    <div className="stat-donut">
      <svg
        className="stat-donut__svg"
        viewBox="0 0 160 160"
        role="img"
        aria-label={alt}
        focusable="false"
      >
        <circle className="stat-donut__track" cx="80" cy="80" r={DONUT_RADIUS} fill="none" />
        {segments
          .filter((segment) => segment.value > 0)
          .map((segment) => {
            const length = (segment.value / sum) * DONUT_LENGTH;
            const gap = segments.filter((s) => s.value > 0).length > 1 ? 2 : 0;
            const circle = (
              <circle
                key={segment.key}
                className={`stat-ring stat-donut__segment stat-tone--${segment.tone}`}
                cx="80"
                cy="80"
                r={DONUT_RADIUS}
                fill="none"
                strokeDasharray={`${Math.max(length - gap, 0.5)} ${DONUT_LENGTH}`}
                strokeDashoffset={-offset}
              />
            );
            offset += length;
            return circle;
          })}
        <text className="stat-donut__total" x="80" y="82" textAnchor="middle">
          {new Intl.NumberFormat(locale).format(total)}
        </text>
        <text className="stat-donut__caption" x="80" y="102" textAnchor="middle">
          {centerLabel}
        </text>
      </svg>
      <ul className="stat-legend">
        {segments.map((segment) => (
          <li key={segment.key}>
            <span className={`stat-swatch stat-swatch--${segment.tone}`} aria-hidden="true" />
            <span className="stat-legend__label">{segment.label}</span>
            <span className="stat-legend__value">
              {new Intl.NumberFormat(locale).format(segment.value)}
              <span className="stat-legend__share">
                {' · '}
                {formatPercent(locale, sum > 0 ? segment.value / sum : 0)}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <ChartDataTable
        caption={tableCaption}
        headers={headers}
        rows={segments.map((segment) => [
          segment.label,
          segment.value,
          formatPercent(locale, sum > 0 ? segment.value / sum : 0),
        ])}
      />
    </div>
  );
}

function niceMax(value) {
  if (value <= 4) return Math.max(value, 1);
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((candidate) => candidate * magnitude >= value / 4);
  return Math.ceil(value / (step * magnitude)) * step * magnitude;
}

const COLUMN_HEIGHT = 220;
const COLUMN_MARGIN = { top: 16, right: 8, bottom: 30, left: 34 };

/**
 * Histogramme à colonnes. `rows` : { key, label, value, barLabel }. Les
 * étiquettes de l'axe sont espacées selon la largeur disponible.
 */
export function ColumnChart({ rows, alt, tableCaption, headers }) {
  const { locale } = useI18n();
  const [ref, width] = useContainerWidth(560);
  const max = niceMax(Math.max(...rows.map((row) => row.value), 1));
  const plotWidth = Math.max(width - COLUMN_MARGIN.left - COLUMN_MARGIN.right, 40);
  const plotHeight = COLUMN_HEIGHT - COLUMN_MARGIN.top - COLUMN_MARGIN.bottom;
  const slot = plotWidth / rows.length;
  const barWidth = Math.min(Math.max(slot * 0.68, 3), 44);
  const labelEvery = Math.max(1, Math.ceil(46 / slot));
  const ticks = [0, max / 2, max].filter((tick, index, all) => all.indexOf(tick) === index);
  const y = (value) => COLUMN_MARGIN.top + plotHeight - (value / max) * plotHeight;
  const integer = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });

  return (
    <div className="stat-columns" ref={ref}>
      <svg
        className="stat-columns__svg"
        viewBox={`0 0 ${width} ${COLUMN_HEIGHT}`}
        width={width}
        height={COLUMN_HEIGHT}
        role="img"
        aria-label={alt}
        focusable="false"
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              className={tick === 0 ? 'stat-axis' : 'stat-gridline'}
              x1={COLUMN_MARGIN.left}
              x2={width - COLUMN_MARGIN.right}
              y1={y(tick)}
              y2={y(tick)}
            />
            <text
              className="stat-axis-label"
              x={COLUMN_MARGIN.left - 6}
              y={y(tick) + 4}
              textAnchor="end"
            >
              {integer.format(tick)}
            </text>
          </g>
        ))}
        {rows.map((row, index) => {
          const x = COLUMN_MARGIN.left + slot * index + (slot - barWidth) / 2;
          const height = (row.value / max) * plotHeight;
          return (
            <g key={row.key}>
              <rect
                className="stat-bar"
                x={x}
                y={y(row.value)}
                width={barWidth}
                height={Math.max(height, row.value > 0 ? 2 : 0)}
                rx="2"
              >
                <title>{row.barLabel}</title>
              </rect>
              {barWidth >= 18 && row.value > 0 ? (
                <text
                  className="stat-bar-value"
                  x={x + barWidth / 2}
                  y={y(row.value) - 5}
                  textAnchor="middle"
                >
                  {integer.format(row.value)}
                </text>
              ) : null}
              {index % labelEvery === 0 ? (
                <text
                  className="stat-axis-label"
                  x={x + barWidth / 2}
                  y={COLUMN_HEIGHT - 10}
                  textAnchor="middle"
                >
                  {row.label}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <ChartDataTable
        caption={tableCaption}
        headers={headers}
        rows={rows.map((row) => [row.label, row.value])}
      />
    </div>
  );
}

/** Liste classée avec barres proportionnelles (top lieux, noms, générations). */
export function BarList({ rows, ordered = true, tableCaption, headers }) {
  const { locale } = useI18n();
  const max = Math.max(...rows.map((row) => row.value), 1);
  const List = ordered ? 'ol' : 'ul';
  return (
    <>
      <List className="stat-barlist">
        {rows.map((row) => (
          <li key={row.key}>
            <span className="stat-barlist__label" title={row.label}>
              {row.label}
            </span>
            <svg
              className="stat-barlist__bar"
              viewBox="0 0 100 10"
              preserveAspectRatio="none"
              aria-hidden="true"
              focusable="false"
            >
              <rect className="stat-barlist__track" x="0" y="0" width="100" height="10" rx="2" />
              <rect
                className="stat-bar"
                x="0"
                y="0"
                width={Math.max((row.value / max) * 100, 2)}
                height="10"
                rx="2"
              />
            </svg>
            <span className="stat-barlist__value">
              {new Intl.NumberFormat(locale).format(row.value)}
            </span>
          </li>
        ))}
      </List>
      {tableCaption ? (
        <ChartDataTable
          caption={tableCaption}
          headers={headers}
          rows={rows.map((row) => [row.label, row.value])}
        />
      ) : null}
    </>
  );
}

/** Jauge circulaire : le pourcentage est écrit au centre. */
export function Gauge({ percent, alt, caption }) {
  const radius = 52;
  const length = 2 * Math.PI * radius;
  return (
    <svg className="stat-gauge" viewBox="0 0 140 140" role="img" aria-label={alt} focusable="false">
      <circle className="stat-gauge__track" cx="70" cy="70" r={radius} fill="none" />
      <circle
        className="stat-ring stat-gauge__arc"
        cx="70"
        cy="70"
        r={radius}
        fill="none"
        strokeDasharray={`${(Math.min(percent, 100) / 100) * length} ${length}`}
      />
      <text className="stat-gauge__value" x="70" y="76" textAnchor="middle">
        {caption}
      </text>
    </svg>
  );
}

/** Barre de progression « avec / sans » : le motif hachuré marque le manque. */
export function RatioBar({ have, total, label, valueText, hint }) {
  const id = useId();
  const ratio = total > 0 ? Math.min(have / total, 1) : 0;
  return (
    <div className="stat-ratio">
      <div className="stat-ratio__head">
        <span className="stat-ratio__label">{label}</span>
        <span className="stat-ratio__value">{valueText}</span>
      </div>
      <svg
        className="stat-ratio__bar"
        viewBox="0 0 100 12"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <pattern id={id} width="4" height="4" patternUnits="userSpaceOnUse">
            <path className="stat-hatch" d="M-1 5L5 -1" />
          </pattern>
        </defs>
        <rect className="stat-ratio__missing" x="0" y="0" width="100" height="12" rx="3" />
        <rect fill={`url(#${id})`} x="0" y="0" width="100" height="12" rx="3" />
        {ratio > 0 ? (
          <rect className="stat-bar" x="0" y="0" width={ratio * 100} height="12" rx="3" />
        ) : null}
      </svg>
      {hint ? <span className="stat-ratio__hint">{hint}</span> : null}
    </div>
  );
}
