import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  buildTreeSvg,
  downloadBlob,
  downloadSvg,
  svgToPngBlob,
  tileSvg,
} from '../export/tree-export.js';

const MODES = [
  { id: 'family', label: 'Familial' },
  { id: 'ancestors', label: 'Ascendant' },
  { id: 'descendants', label: 'Descendant' },
  { id: 'fan', label: 'Éventail' },
];
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 2;

function clampZoom(value) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value * 100) / 100));
}

// Réglages d'affichage partagés par tous les nœuds (années, repli, période).
const TreeViewContext = createContext({
  lifespans: new Map(),
  collapsed: new Set(),
  toggle: () => {},
  period: null,
});

function outsidePeriod(lifespan, period) {
  if (!period || !lifespan?.birthYear) return false;
  return (
    (period.from !== null && lifespan.birthYear < period.from) ||
    (period.to !== null && lifespan.birthYear > period.to)
  );
}

function TreeNode({ person, sosa, branch, focus, onSelect }) {
  const { lifespans, period } = useContext(TreeViewContext);
  const lifespan = lifespans.get(person.id);
  const dimmed = outsidePeriod(lifespan, period);
  return (
    <button
      type="button"
      className={`tree-node${focus ? ' tree-node--focus' : ''}${branch ? ` tree-node--${branch}` : ''}${dimmed ? ' tree-node--dimmed' : ''}`}
      onClick={() => onSelect(person.id)}
    >
      <span className="person-card__name">
        {person.given_names} {person.family_name}
      </span>
      {lifespan ? <span className="person-card__years">{lifespan.label}</span> : null}
      {dimmed ? <span className="gds-visually-hidden"> (hors de la période filtrée)</span> : null}
      <span className="tree-node__meta">
        {branch ? (
          <span
            className="tree-node__branch"
            aria-label={branch === 'paternal' ? 'Branche paternelle' : 'Branche maternelle'}
          >
            {branch === 'paternal' ? 'P' : 'M'}
          </span>
        ) : null}
        {sosa ? <span className="data-id">Sosa {sosa}</span> : null}
      </span>
    </button>
  );
}

// Arbre récursif horizontal : la personne à gauche, ses parents (ou enfants) à
// droite. Chaque nœud ayant des proches affichés peut être replié / déplié.
function Branch({
  person,
  linksOf,
  sosa,
  branch,
  focus,
  onSelect,
  withSosa,
  showSosa = true,
  relation,
}) {
  const { collapsed, toggle } = useContext(TreeViewContext);
  const linked = linksOf.get(person.id) ?? [];
  const ordered = withSosa
    ? [...linked].sort((a, b) => (a.sex === 'F' ? 1 : 0) - (b.sex === 'F' ? 1 : 0))
    : linked;
  const isCollapsed = collapsed.has(person.id);
  const name = `${person.given_names} ${person.family_name}`;
  return (
    <div className="tree-branch">
      <TreeNode person={person} sosa={sosa} branch={branch} focus={focus} onSelect={onSelect} />
      {ordered.length > 0 ? (
        <button
          type="button"
          className="tree-branch__toggle"
          aria-expanded={!isCollapsed}
          aria-label={`${isCollapsed ? 'Déplier' : 'Replier'} les ${relation} de ${name}`}
          title={isCollapsed ? `Déplier (${ordered.length})` : 'Replier'}
          onClick={() => toggle(person.id)}
        >
          {isCollapsed ? `+${ordered.length}` : '−'}
        </button>
      ) : null}
      {ordered.length > 0 && !isCollapsed ? (
        <div className="tree-branch__children">
          {ordered.map((relative, index) => {
            const childSosa =
              withSosa && showSosa && sosa
                ? sosa * 2 + (relative.sex === 'F' ? 1 : relative.sex === 'M' ? 0 : index)
                : null;
            const childBranch =
              branch ?? (withSosa ? (relative.sex === 'F' ? 'maternal' : 'paternal') : null);
            return (
              <Branch
                key={relative.id}
                person={relative}
                linksOf={linksOf}
                sosa={childSosa}
                branch={childBranch}
                onSelect={onSelect}
                withSosa={withSosa}
                showSosa={showSosa}
                relation={relation}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

// Numérotation Sosa-Stradonitz : père = 2n, mère = 2n + 1.
export function computeSosa(rootId, items) {
  const sosa = new Map([[rootId, 1]]);
  const byVia = new Map();
  for (const item of items) {
    if (!byVia.has(item.viaId)) byVia.set(item.viaId, []);
    byVia.get(item.viaId).push(item);
  }
  const queue = [rootId];
  while (queue.length > 0) {
    const id = queue.shift();
    const parents = byVia.get(id) ?? [];
    parents.forEach((parent, index) => {
      if (sosa.has(parent.id)) return;
      const offset = parent.sex === 'F' ? 1 : parent.sex === 'M' ? 0 : index % 2;
      sosa.set(parent.id, sosa.get(id) * 2 + offset);
      queue.push(parent.id);
    });
  }
  return sosa;
}

const FAN_CENTER = 220;
const FAN_INNER = 56;
const FAN_RING = 46;

function arcPath(r0, r1, a0, a1) {
  const point = (r, a) => `${FAN_CENTER + r * Math.cos(a)} ${FAN_CENTER + r * Math.sin(a)}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${point(r0, a0)} L ${point(r1, a0)} A ${r1} ${r1} 0 ${large} 1 ${point(r1, a1)} L ${point(r0, a1)} A ${r0} ${r0} 0 ${large} 0 ${point(r0, a0)} Z`;
}

// Éventail ascendant sur un demi-cercle : un anneau par génération, un
// secteur par numéro Sosa. Chaque secteur est un lien SVG focusable.
function FanChart({ root, items, onSelect }) {
  const sosa = computeSosa(root.id, items);
  const people = [root, ...items];
  const generations = Math.max(1, ...items.map((item) => item.generation));
  const size = FAN_CENTER * 2;
  return (
    <svg
      className="fan-chart"
      viewBox={`0 0 ${size} ${FAN_CENTER + 20}`}
      width={size * 1.6}
      role="group"
      aria-label={`Éventail des ancêtres de ${root.given_names} ${root.family_name}`}
    >
      {people.map((person) => {
        const number = sosa.get(person.id);
        if (!number) return null;
        const generation = Math.floor(Math.log2(number));
        if (generation > generations) return null;
        const label = `${person.given_names} ${person.family_name}`;
        const handleKey = (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onSelect(person.id);
          }
        };
        if (generation === 0) {
          return (
            <g
              key={person.id}
              role="button"
              tabIndex={0}
              className="fan-chart__sector"
              aria-label={`${label}, Sosa 1`}
              onClick={() => onSelect(person.id)}
              onKeyDown={handleKey}
            >
              <path
                className="fan-chart__cell fan-chart__cell--root"
                d={arcPath(0.01, FAN_INNER, Math.PI, 2 * Math.PI)}
              />
              <text
                className="fan-chart__text"
                x={FAN_CENTER}
                y={FAN_CENTER - 18}
                textAnchor="middle"
              >
                {person.given_names}
              </text>
              <text
                className="fan-chart__text"
                x={FAN_CENTER}
                y={FAN_CENTER - 6}
                textAnchor="middle"
              >
                {person.family_name}
              </text>
            </g>
          );
        }
        const count = 2 ** generation;
        const index = number - count;
        const a0 = Math.PI + (index * Math.PI) / count;
        const a1 = a0 + Math.PI / count;
        const r0 = FAN_INNER + (generation - 1) * FAN_RING;
        const r1 = r0 + FAN_RING;
        const mid = (a0 + a1) / 2;
        const radius = (r0 + r1) / 2;
        const x = FAN_CENTER + radius * Math.cos(mid);
        const y = FAN_CENTER + radius * Math.sin(mid);
        const branch = number.toString(2)[1] === '1' ? 'maternal' : 'paternal';
        const short = generation >= 4 ? person.given_names.charAt(0) + '.' : person.given_names;
        return (
          <g
            key={person.id}
            role="button"
            tabIndex={0}
            className="fan-chart__sector"
            aria-label={`${label}, Sosa ${number}`}
            onClick={() => onSelect(person.id)}
            onKeyDown={handleKey}
          >
            <path
              className={`fan-chart__cell fan-chart__cell--${branch}`}
              d={arcPath(r0, r1, a0, a1)}
            />
            <text
              className="fan-chart__text"
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={generation >= 3 ? 7 : 9}
            >
              {short}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function TreeExplorer({
  client,
  selected,
  onSelect,
  familyView,
  defaultMode = 'family',
  defaultDepth = 4,
  showSosa = true,
  lifespans = new Map(),
}) {
  const [mode, setMode] = useState(defaultMode);
  const [depth, setDepth] = useState(defaultDepth);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [branchFilter, setBranchFilter] = useState('all');
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const toggleCollapsed = useCallback((id) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const [layout, setLayout] = useState(null);
  const period =
    periodFrom || periodTo
      ? {
          from: periodFrom ? Number(periodFrom) : null,
          to: periodTo ? Number(periodTo) : null,
        }
      : null;
  const [items, setItems] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef(null);
  const stageRef = useRef(null);
  const [exportError, setExportError] = useState(null);
  const [giant, setGiant] = useState(null);
  const [giantOptions, setGiantOptions] = useState({ pageSize: 'A4', pagesWide: 2 });
  const [printTiles, setPrintTiles] = useState(null);

  useEffect(() => {
    if (mode === 'family' || !selected) return undefined;
    let cancelled = false;
    setItems(null);
    setLoadError(null);
    const request =
      mode === 'ancestors' || mode === 'fan'
        ? client.graph.ancestors(selected.id, mode === 'fan' ? Math.min(depth, 6) : depth)
        : client.graph.descendants(selected.id, depth);
    request
      .then((list) => !cancelled && setItems(list))
      .catch((error) => !cancelled && setLoadError(error.message));
    return () => {
      cancelled = true;
    };
  }, [client, mode, depth, selected]);

  const baseName = selected
    ? `arbre-${mode}-${selected.given_names}-${selected.family_name}`
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
    : 'arbre';

  const currentSvg = () =>
    buildTreeSvg(stageRef.current, {
      title: selected ? `Arbre de ${selected.given_names} ${selected.family_name}` : 'Arbre',
    });

  const runExport = async (kind) => {
    setExportError(null);
    try {
      const svg = currentSvg();
      if (kind === 'svg') downloadSvg(`${baseName}.svg`, svg);
      else downloadBlob(`${baseName}.png`, await svgToPngBlob(svg));
    } catch (error) {
      setExportError(error.message);
    }
  };

  // Impression géante : l'arbre est découpé en pages (avec recouvrement pour
  // l'assemblage), imprimables ou enregistrables en PDF via la boîte système.
  useEffect(() => {
    if (!printTiles) return undefined;
    const done = () => {
      delete document.documentElement.dataset.print;
      setPrintTiles(null);
    };
    document.documentElement.dataset.print = 'tiles';
    window.addEventListener('afterprint', done, { once: true });
    const timer = setTimeout(() => window.print?.(), 50);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('afterprint', done);
    };
  }, [printTiles]);

  const recenter = useCallback(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  useEffect(recenter, [selected?.id, mode, recenter]);

  // Pavé tactile : pincement (ctrlKey) = zoom, deux doigts = déplacement.
  // Souris : molette + Ctrl = zoom, molette seule = défilement vertical.
  const handleWheel = (event) => {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      setZoom((current) => clampZoom(current * (event.deltaY > 0 ? 0.9 : 1.1)));
    } else {
      setOffset((current) => ({ x: current.x - event.deltaX, y: current.y - event.deltaY }));
    }
  };

  const viewportRef = useRef(null);
  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return undefined;
    node.addEventListener('wheel', handleWheel, { passive: false });
    return () => node.removeEventListener('wheel', handleWheel);
  });

  const handlePointerDown = (event) => {
    if (event.button !== 0 || event.target.closest('button')) return;
    drag.current = { x: event.clientX - offset.x, y: event.clientY - offset.y };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const handlePointerMove = (event) => {
    if (!drag.current) return;
    setOffset({ x: event.clientX - drag.current.x, y: event.clientY - drag.current.y });
  };
  const handlePointerUp = () => {
    drag.current = null;
  };

  const handleKeyDown = (event) => {
    const step = 40;
    const moves = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    if (event.target !== event.currentTarget) return;
    if (moves[event.key]) {
      event.preventDefault();
      const [dx, dy] = moves[event.key];
      setOffset((current) => ({ x: current.x + dx, y: current.y + dy }));
    } else if (event.key === '+' || event.key === '=') {
      setZoom((current) => clampZoom(current + 0.1));
    } else if (event.key === '-') {
      setZoom((current) => clampZoom(current - 0.1));
    } else if (event.key === '0') {
      recenter();
    }
  };

  // Isolation d'une branche : Sosa 2 (père) et ses ascendants, ou Sosa 3 (mère).
  let visibleItems = items ?? [];
  if (selected && branchFilter !== 'all' && (mode === 'ancestors' || mode === 'fan')) {
    const sosa = computeSosa(selected.id, visibleItems);
    const wanted = branchFilter === 'paternal' ? 2 : 3;
    visibleItems = visibleItems.filter((item) => {
      const number = sosa.get(item.id);
      if (!number) return false;
      const generation = Math.floor(Math.log2(number));
      return number >> (generation - 1) === wanted;
    });
  }
  const linksOf = new Map();
  for (const item of visibleItems) {
    if (!linksOf.has(item.viaId)) linksOf.set(item.viaId, []);
    linksOf.get(item.viaId).push(item);
  }

  let content;
  if (mode === 'family' || !selected) {
    content = familyView;
  } else if (loadError) {
    content = (
      <p role="alert" className="notice notice--error">
        {loadError}
      </p>
    );
  } else if (items === null) {
    content = (
      <p role="status" className="loading-line">
        Chargement de l’arbre…
      </p>
    );
  } else if (mode === 'fan') {
    content = <FanChart root={selected} items={visibleItems} onSelect={onSelect} />;
  } else {
    content = (
      <>
        {items.length === 0 ? (
          <p className="notice">
            {mode === 'ancestors' ? 'Aucun ancêtre enregistré.' : 'Aucun descendant enregistré.'}
          </p>
        ) : null}
        <Branch
          person={selected}
          linksOf={linksOf}
          sosa={mode === 'ancestors' && showSosa ? 1 : null}
          focus
          onSelect={onSelect}
          withSosa={mode === 'ancestors'}
          showSosa={showSosa}
          relation={mode === 'ancestors' ? 'parents' : 'enfants'}
        />
      </>
    );
  }

  // Mesure de l'arbre pour la minicarte (coordonnées non zoomées).
  useLayoutEffect(() => {
    const stage = stageRef.current;
    const viewport = viewportRef.current;
    if (!stage || !viewport) return;
    const origin = stage.getBoundingClientRect();
    const scale = zoom || 1;
    const boxes = [...stage.querySelectorAll('.tree-node, .person-card, .fan-chart')].map(
      (node) => {
        const rect = node.getBoundingClientRect();
        return {
          x: (rect.left - origin.left) / scale,
          y: (rect.top - origin.top) / scale,
          width: rect.width / scale,
          height: rect.height / scale,
          focus:
            node.classList.contains('tree-node--focus') ||
            node.classList.contains('person-card--selected'),
        };
      },
    );
    const width = Math.max(stage.scrollWidth, ...boxes.map((box) => box.x + box.width), 1);
    const height = Math.max(stage.scrollHeight, ...boxes.map((box) => box.y + box.height), 1);
    const next = {
      boxes,
      width,
      height,
      viewWidth: viewport.clientWidth,
      viewHeight: viewport.clientHeight,
    };
    setLayout((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
  });

  const MINIMAP = { width: 180, height: 120 };
  const miniScale = layout
    ? Math.min(MINIMAP.width / layout.width, MINIMAP.height / layout.height)
    : 1;
  const moveFromMinimap = (event) => {
    if (!layout) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const targetX = (event.clientX - rect.left) / miniScale;
    const targetY = (event.clientY - rect.top) / miniScale;
    setOffset({
      x: layout.viewWidth / 2 - targetX * zoom,
      y: layout.viewHeight / 2 - targetY * zoom,
    });
  };

  return (
    <div className="tree-explorer">
      <div className="tree-toolbar">
        <div className="segmented" role="group" aria-label="Type d’arbre">
          {MODES.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={mode === item.id}
              onClick={() => setMode(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        {mode !== 'family' ? (
          <label className="tree-toolbar__depth">
            <span>Générations</span>
            <input
              type="number"
              min="1"
              max="30"
              value={depth}
              onChange={(event) => setDepth(Math.max(1, Number(event.target.value) || 1))}
            />
          </label>
        ) : null}
        {mode === 'ancestors' || mode === 'fan' ? (
          <label className="tree-toolbar__depth">
            <span>Branche</span>
            <select value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)}>
              <option value="all">Toutes</option>
              <option value="paternal">Paternelle</option>
              <option value="maternal">Maternelle</option>
            </select>
          </label>
        ) : null}
        {mode !== 'family' ? (
          <fieldset className="tree-toolbar__period">
            <legend>Période de naissance</legend>
            <label>
              <span className="gds-visually-hidden">Née à partir de l’année</span>
              <input
                type="number"
                inputMode="numeric"
                placeholder="1700"
                value={periodFrom}
                onChange={(event) => setPeriodFrom(event.target.value)}
              />
            </label>
            <span aria-hidden="true">→</span>
            <label>
              <span className="gds-visually-hidden">Née jusqu’à l’année</span>
              <input
                type="number"
                inputMode="numeric"
                placeholder="1950"
                value={periodTo}
                onChange={(event) => setPeriodTo(event.target.value)}
              />
            </label>
          </fieldset>
        ) : null}
        {collapsed.size > 0 ? (
          <button
            type="button"
            className="tree-toolbar__plain"
            onClick={() => setCollapsed(new Set())}
          >
            Tout déplier
          </button>
        ) : null}
        <div className="tree-toolbar__zoom" role="group" aria-label="Zoom">
          <button
            type="button"
            aria-label="Zoom arrière"
            onClick={() => setZoom((z) => clampZoom(z - 0.1))}
          >
            −
          </button>
          <output aria-live="polite">{Math.round(zoom * 100)} %</output>
          <button
            type="button"
            aria-label="Zoom avant"
            onClick={() => setZoom((z) => clampZoom(z + 0.1))}
          >
            +
          </button>
          <button type="button" onClick={recenter}>
            Recentrer
          </button>
        </div>
        <details className="tree-toolbar__menu">
          <summary>Exporter</summary>
          <div className="tree-toolbar__export" role="group" aria-label="Exporter l’arbre">
            <button type="button" onClick={() => runExport('svg')}>
              SVG
            </button>
            <button type="button" onClick={() => runExport('png')}>
              PNG
            </button>
            <button type="button" onClick={() => window.print?.()}>
              Imprimer / PDF
            </button>
            <button
              type="button"
              aria-expanded={giant !== null}
              onClick={() => {
                setExportError(null);
                try {
                  const svg = currentSvg();
                  setGiant({ svg, ...tileSvg(svg, giantOptions) });
                } catch (error) {
                  setExportError(error.message);
                }
              }}
            >
              Impression géante
            </button>
          </div>
        </details>
      </div>
      {exportError ? (
        <p role="alert" className="notice notice--error tree-explorer__notice">
          {exportError}
        </p>
      ) : null}
      {giant ? (
        <section className="giant-print" aria-labelledby="giant-print-title">
          <h4 id="giant-print-title">Impression géante</h4>
          <div className="giant-print__options">
            <label>
              <span>Format de page</span>
              <select
                value={giantOptions.pageSize}
                onChange={(event) => {
                  const options = { ...giantOptions, pageSize: event.target.value };
                  setGiantOptions(options);
                  setGiant({ svg: giant.svg, ...tileSvg(giant.svg, options) });
                }}
              >
                <option value="A4">A4 paysage</option>
                <option value="A3">A3 paysage</option>
              </select>
            </label>
            <label>
              <span>Pages en largeur</span>
              <input
                type="number"
                min="1"
                max="10"
                value={giantOptions.pagesWide}
                onChange={(event) => {
                  const pagesWide = Math.min(10, Math.max(1, Number(event.target.value) || 1));
                  const options = { ...giantOptions, pagesWide };
                  setGiantOptions(options);
                  setGiant({ svg: giant.svg, ...tileSvg(giant.svg, options) });
                }}
              />
            </label>
            <p className="data-id" aria-live="polite">
              {giant.tiles.length} page(s) · {giant.columns} × {giant.rows}
            </p>
            <button type="button" className="primary-inline" onClick={() => setPrintTiles(giant)}>
              Imprimer les {giant.tiles.length} pages
            </button>
            <button type="button" onClick={() => setGiant(null)}>
              Fermer
            </button>
          </div>
          <div
            className="giant-print__preview"
            style={{ gridTemplateColumns: `repeat(${giant.columns}, 1fr)` }}
            aria-label="Aperçu du découpage"
          >
            {giant.tiles.map((tile) => (
              <figure key={`${tile.row}-${tile.column}`} className="giant-print__tile">
                <div
                  className="giant-print__svg"
                  // SVG généré localement, textes échappés (voir tree-export.js).
                  dangerouslySetInnerHTML={{ __html: tile.svg }}
                />
                <figcaption className="data-id">
                  Ligne {tile.row} · colonne {tile.column}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      ) : null}
      {printTiles ? (
        <div className={`print-tiles print-tiles--${giantOptions.pageSize}`} aria-hidden="true">
          {printTiles.tiles.map((tile) => (
            <div
              key={`${tile.row}-${tile.column}`}
              className="print-tiles__page"
              dangerouslySetInnerHTML={{ __html: tile.svg }}
            />
          ))}
        </div>
      ) : null}
      {/* Canevas déplaçable : focusable pour le clavier (flèches, +, −, 0), les
          nœuds restent des boutons natifs. */}
      {/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */}
      <div
        ref={viewportRef}
        className="tree-viewport"
        tabIndex={0}
        role="application"
        aria-roledescription="arbre navigable"
        aria-label="Arbre : glisser pour déplacer, Ctrl + molette ou pincement pour zoomer, flèches pour déplacer, + et − pour zoomer, 0 pour recentrer"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleKeyDown}
      >
        <div
          ref={stageRef}
          className="tree-stage"
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}
        >
          <TreeViewContext.Provider
            value={{ lifespans, collapsed, toggle: toggleCollapsed, period }}
          >
            {content}
          </TreeViewContext.Provider>
        </div>
      </div>
      {/* eslint-enable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */}
      {layout && layout.boxes.length > 0 ? (
        <div className="minimap" aria-hidden="true">
          <p className="minimap__title">Minicarte</p>
          <div
            className="minimap__canvas"
            style={{
              width: Math.ceil(layout.width * miniScale),
              height: Math.ceil(layout.height * miniScale),
            }}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture?.(event.pointerId);
              moveFromMinimap(event);
            }}
            onPointerMove={(event) => {
              if (event.buttons === 1) moveFromMinimap(event);
            }}
          >
            {layout.boxes.map((box, index) => (
              <span
                key={index}
                className={`minimap__node${box.focus ? ' minimap__node--focus' : ''}`}
                style={{
                  left: box.x * miniScale,
                  top: box.y * miniScale,
                  width: Math.max(2, box.width * miniScale),
                  height: Math.max(2, box.height * miniScale),
                }}
              />
            ))}
            <span
              className="minimap__view"
              style={{
                left: (-offset.x / zoom) * miniScale,
                top: (-offset.y / zoom) * miniScale,
                width: (layout.viewWidth / zoom) * miniScale,
                height: (layout.viewHeight / zoom) * miniScale,
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
