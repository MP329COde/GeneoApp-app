import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button, useTranslation } from '../design-system/index.js';
import { useEventLabel } from '../genealogy/event-labels.js';
import { formatGenealogyDate } from '../../../db/src/dates/genealogy-date.js';
import {
  GESTURE_THRESHOLD,
  KEYBOARD_PAN_STEP,
  ZOOM_FACTOR,
  CATEGORIES,
  buildLifelines,
  buildTicks,
  extentOf,
  neighbourMarker,
  panView,
  unitsToYears,
  xOf,
  yearLabel,
  zoomRatio,
  zoomView,
} from './lifeline-chart.js';

/** Géométrie du viewBox : colonne des noms à gauche, zone de tracé à droite. */
export const PLOT = { left: 168, width: 776 };
const VIEWBOX_WIDTH = 960;
const ROW_HEIGHT = 38;
const AXIS_HEIGHT = 34;
const MARKER_RADIUS = 7;
const NAME_MAX_CHARS = 17;

/** Forme d'un marqueur : la forme porte l'information autant que la couleur. */
export function MarkerShape({ category, x = 0, y = 0, r = MARKER_RADIUS }) {
  const common = { className: `lifeline__shape lifeline__shape--${category}` };
  if (category === 'birth') return <circle cx={x} cy={y} r={r} {...common} />;
  if (category === 'death') {
    return (
      <rect x={x - r + 1} y={y - r + 1} width={(r - 1) * 2} height={(r - 1) * 2} {...common} />
    );
  }
  if (category === 'marriage') {
    return (
      <polygon
        points={`${x},${y - r - 1} ${x + r + 1},${y} ${x},${y + r + 1} ${x - r - 1},${y}`}
        {...common}
      />
    );
  }
  return (
    <polygon points={`${x},${y - r} ${x + r},${y + r - 1} ${x - r},${y + r - 1}`} {...common} />
  );
}

function shortName(name) {
  return name.length > NAME_MAX_CHARS ? `${name.slice(0, NAME_MAX_CHARS - 1)}…` : name;
}

/**
 * Frise graphique hors ligne : une ligne de vie par personne, des marqueurs
 * d'événements, un axe des années à graduations adaptatives, zoom et
 * déplacement. Aucune ressource externe.
 */
export function LifelineChart({ persons, events, selectedId, onSelect, now }) {
  const { t } = useTranslation();
  const eventLabel = useEventLabel();
  const id = useId().replace(/:/g, '');
  const hatchId = `${id}-hatch`;
  const instructionsId = `${id}-help`;
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const movedRef = useRef(false);

  const allRows = useMemo(() => buildLifelines(persons, events, { now }), [persons, events, now]);
  const extent = useMemo(() => extentOf(allRows), [allRows]);
  const [view, setView] = useState(extent);
  const [activeKey, setActiveKey] = useState(null);

  useEffect(() => {
    setView(extent);
  }, [extent]);

  const current = view ?? extent;
  const rows = useMemo(() => {
    if (!current) return [];
    return allRows
      .filter((row) => row.to >= current.start && row.from <= current.end)
      .map((row) => ({
        ...row,
        shown: row.markers.filter((m) => m.to >= current.start && m.from <= current.end),
      }));
  }, [allRows, current]);

  if (!extent || !current) {
    return (
      <p className="notice">
        {t('lifeline.empty', 'Aucun événement daté : la frise n’a rien à afficher.')}
      </p>
    );
  }

  const navRows = rows
    .filter((row) => row.shown.length > 0)
    .map((row) => ({ ...row, markers: row.shown }));
  const firstKey = navRows[0]?.markers[0]?.key ?? null;
  const tabbableKey = navRows.some((row) => row.markers.some((m) => m.key === activeKey))
    ? activeKey
    : firstKey;
  const ticks = buildTicks(current);
  const bodyHeight = Math.max(rows.length, 1) * ROW_HEIGHT;
  const percent = Math.round(zoomRatio(current, extent) * 100);
  const mid = (current.start + current.end) / 2;
  const x = (value) => xOf(current, PLOT, value);
  const clampX = (value) => Math.min(PLOT.left + PLOT.width, Math.max(PLOT.left, x(value)));

  const zoomBy = (factor, anchor = mid) =>
    setView((v) => zoomView(v ?? extent, extent, factor, anchor));
  const panYears = (years) => setView((v) => panView(v ?? extent, extent, years));
  const step = unitsToYears(current, PLOT, KEYBOARD_PAN_STEP);

  const focusMarker = (key) => {
    setActiveKey(key);
    const markers = svgRef.current?.querySelectorAll('[data-marker-key]') ?? [];
    Array.from(markers)
      .find((node) => node.getAttribute('data-marker-key') === key)
      ?.focus();
  };

  const onSvgKeyDown = (event) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'ArrowLeft') panYears(-step);
    else if (event.key === 'ArrowRight') panYears(step);
    else if (event.key === '+' || event.key === '=') zoomBy(ZOOM_FACTOR);
    else if (event.key === '-' || event.key === '_') zoomBy(1 / ZOOM_FACTOR);
    else if (event.key === '0' || event.key === 'Home') setView(extent);
    else return;
    event.preventDefault();
  };

  const onMarkerKeyDown = (event, marker) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect?.(marker.personId);
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const next = neighbourMarker(navRows, marker.key, event.key);
    if (next) focusMarker(next);
  };

  const onPointerDown = (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    movedRef.current = false;
    dragRef.current = { x: event.clientX, start: current };
    const move = (moveEvent) => {
      const drag = dragRef.current;
      const rect = svgRef.current?.getBoundingClientRect();
      if (!drag || !rect?.width) return;
      const dx = moveEvent.clientX - drag.x;
      if (Math.abs(dx) > GESTURE_THRESHOLD) movedRef.current = true;
      if (!movedRef.current) return;
      const units = (dx / rect.width) * VIEWBOX_WIDTH;
      setView(panView(drag.start, extent, -unitsToYears(drag.start, PLOT, units)));
    };
    const stop = () => {
      dragRef.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  };

  const onWheel = (event) => {
    // Sans Ctrl / Cmd, la molette fait défiler les lignes verticalement.
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const rect = svgRef.current?.getBoundingClientRect();
    const units = rect?.width ? ((event.clientX - rect.left) / rect.width) * VIEWBOX_WIDTH : mid;
    const anchor =
      current.start + ((units - PLOT.left) / PLOT.width) * (current.end - current.start);
    zoomBy(event.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR, anchor);
  };

  const markerLabel = (row, marker) =>
    t(
      'lifeline.markerLabel',
      {
        event: eventLabel(marker.type),
        name: row.name,
        date: formatGenealogyDate(marker.dateText) || marker.dateText,
      },
      '{event}, {name}, {date}',
    );

  const rowLabel = (row) => {
    const span = `${yearLabel(row.start)}`;
    if (row.endKind === 'death') {
      return t(
        'lifeline.rowLabel.died',
        { name: row.name, from: span, to: yearLabel(row.end) },
        '{name}, {from} à {to}',
      );
    }
    if (row.endKind === 'living') {
      return t(
        'lifeline.rowLabel.living',
        { name: row.name, from: span },
        '{name}, né(e) en {from}, vivant(e)',
      );
    }
    return t(
      'lifeline.rowLabel.unknownEnd',
      { name: row.name, from: span },
      '{name}, {from}, fin de vie inconnue',
    );
  };

  const legendLabels = {
    birth: t('lifeline.legend.birth', 'Naissance (cercle)'),
    marriage: t('lifeline.legend.marriage', 'Mariage (losange)'),
    death: t('lifeline.legend.death', 'Décès (carré)'),
    other: t('lifeline.legend.other', 'Autre événement (triangle)'),
  };

  return (
    <div className="lifeline">
      <div
        className="lifeline__controls"
        role="toolbar"
        aria-label={t('lifeline.controls', 'Commandes de la frise')}
      >
        <Button type="button" size="sm" variant="secondary" onClick={() => zoomBy(ZOOM_FACTOR)}>
          {t('lifeline.zoomIn', 'Zoom +')}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => zoomBy(1 / ZOOM_FACTOR)}>
          {t('lifeline.zoomOut', 'Zoom −')}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => panYears(-step * 4)}>
          {t('lifeline.panEarlier', '← Plus tôt')}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => panYears(step * 4)}>
          {t('lifeline.panLater', 'Plus tard →')}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => setView(extent)}>
          {t('lifeline.reset', 'Tout afficher')}
        </Button>
        <output className="lifeline__zoom" aria-live="polite">
          {t(
            'lifeline.range',
            { from: yearLabel(current.start), to: yearLabel(current.end), percent },
            '{from} – {to} · zoom {percent} %',
          )}
        </output>
      </div>
      <p className="gds-visually-hidden" id={instructionsId}>
        {t(
          'lifeline.instructions',
          'Souris : glisser pour déplacer la frise, Ctrl et molette pour zoomer. Clavier : flèches gauche et droite pour déplacer, plus et moins pour zoomer, zéro pour tout afficher. Tabulation pour entrer dans les événements, flèches pour passer de l’un à l’autre, Entrée pour sélectionner la personne.',
        )}
      </p>

      <svg
        className="lifeline__axis"
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${AXIS_HEIGHT}`}
        aria-hidden="true"
        focusable="false"
      >
        {ticks.map((tick) => (
          <g key={tick.value} transform={`translate(${x(tick.value)} 0)`}>
            <line className="lifeline__tick" y1={tick.major ? 20 : 26} y2={AXIS_HEIGHT} />
            {tick.major || ticks.length <= 12 ? (
              <text className="lifeline__tick-label" y={15} textAnchor="middle">
                {tick.value}
              </text>
            ) : null}
          </g>
        ))}
      </svg>

      <div className="lifeline__scroll">
        <svg
          ref={svgRef}
          className="lifeline__canvas"
          viewBox={`0 0 ${VIEWBOX_WIDTH} ${bodyHeight}`}
          role="group"
          aria-label={t('lifeline.chartLabel', 'Frise chronologique des lignes de vie')}
          aria-describedby={instructionsId}
          tabIndex={0}
          onKeyDown={onSvgKeyDown}
          onPointerDown={onPointerDown}
          onWheel={onWheel}
          onClickCapture={(event) => {
            if (movedRef.current) {
              event.stopPropagation();
              event.preventDefault();
              movedRef.current = false;
            }
          }}
        >
          <defs>
            <pattern
              id={hatchId}
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <line className="lifeline__hatch" x1="0" y1="0" x2="0" y2="6" />
            </pattern>
          </defs>
          {ticks.map((tick) => (
            <line
              key={tick.value}
              className={`lifeline__grid${tick.major ? ' lifeline__grid--major' : ''}`}
              x1={x(tick.value)}
              x2={x(tick.value)}
              y1={0}
              y2={bodyHeight}
              aria-hidden="true"
            />
          ))}
          {rows.map((row, index) => {
            const cy = index * ROW_HEIGHT + ROW_HEIGHT / 2;
            const selected = row.personId === selectedId;
            const x1 = clampX(row.start);
            const x2 = clampX(row.end);
            return (
              <g
                key={row.personId}
                role="group"
                aria-label={rowLabel(row)}
                className={`lifeline__row${selected ? ' lifeline__row--selected' : ''}`}
                data-person-id={row.personId}
              >
                <rect
                  className="lifeline__row-bg"
                  x={0}
                  y={index * ROW_HEIGHT}
                  width={VIEWBOX_WIDTH}
                  height={ROW_HEIGHT}
                  aria-hidden="true"
                />
                <text className="lifeline__name" x={8} y={cy + 5} aria-hidden="true">
                  {shortName(row.name)}
                </text>
                <line
                  className={`lifeline__life lifeline__life--${row.endKind}${row.startKnown ? '' : ' lifeline__life--open-start'}`}
                  x1={x1}
                  x2={x2}
                  y1={cy}
                  y2={cy}
                  aria-hidden="true"
                />
                {row.endKind === 'living' && x(row.end) <= PLOT.left + PLOT.width ? (
                  <polygon
                    className="lifeline__arrow"
                    points={`${x2 + 9},${cy} ${x2},${cy - 5} ${x2},${cy + 5}`}
                    aria-hidden="true"
                  />
                ) : null}
                {row.shown.map((marker) =>
                  marker.imprecise ? (
                    <rect
                      key={`${marker.key}-range`}
                      className={`lifeline__range lifeline__range--${marker.category}${marker.open ? ` lifeline__range--open-${marker.open}` : ''}`}
                      x={clampX(marker.from)}
                      y={cy - 5}
                      width={Math.max(2, clampX(marker.to) - clampX(marker.from))}
                      height={10}
                      fill={`url(#${hatchId})`}
                      aria-hidden="true"
                    />
                  ) : null,
                )}
                {row.shown.map((marker) => {
                  const mx = clampX(marker.at);
                  const label = markerLabel(row, marker);
                  return (
                    <g
                      key={marker.key}
                      className={`lifeline__marker lifeline__marker--${marker.category}`}
                      role="button"
                      tabIndex={marker.key === tabbableKey ? 0 : -1}
                      aria-pressed={selected}
                      aria-label={label}
                      data-marker-key={marker.key}
                      onFocus={() => setActiveKey(marker.key)}
                      onClick={() => onSelect?.(marker.personId)}
                      onKeyDown={(event) => onMarkerKeyDown(event, marker)}
                    >
                      <title>{label}</title>
                      <circle className="lifeline__hit" cx={mx} cy={cy} r={MARKER_RADIUS + 5} />
                      <MarkerShape category={marker.category} x={mx} y={cy} />
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>

      <ul className="lifeline__legend" aria-label={t('lifeline.legend', 'Légende de la frise')}>
        {CATEGORIES.map((category) => (
          <li key={category}>
            <svg
              viewBox="-10 -10 20 20"
              width="18"
              height="18"
              aria-hidden="true"
              focusable="false"
            >
              <MarkerShape category={category} />
            </svg>
            {legendLabels[category]}
          </li>
        ))}
        <li>
          <svg viewBox="0 0 28 20" width="28" height="18" aria-hidden="true" focusable="false">
            <rect
              className="lifeline__range lifeline__range--other"
              x="1"
              y="5"
              width="26"
              height="10"
              fill={`url(#${hatchId})`}
            />
          </svg>
          {t(
            'lifeline.legend.imprecise',
            'Date imprécise (plage hachurée : vers, avant, après, entre)',
          )}
        </li>
        <li>
          <svg viewBox="0 0 28 20" width="28" height="18" aria-hidden="true" focusable="false">
            <line
              className="lifeline__life lifeline__life--living"
              x1="1"
              x2="19"
              y1="10"
              y2="10"
            />
            <polygon className="lifeline__arrow" points="27,10 19,5 19,15" />
          </svg>
          {t('lifeline.legend.living', 'Personne vivante (ligne ouverte)')}
        </li>
      </ul>
    </div>
  );
}
