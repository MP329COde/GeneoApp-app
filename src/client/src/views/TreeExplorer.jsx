import { useCallback, useEffect, useRef, useState } from 'react';

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

function TreeNode({ person, sosa, branch, focus, onSelect }) {
  return (
    <button
      type="button"
      className={`tree-node${focus ? ' tree-node--focus' : ''}${branch ? ` tree-node--${branch}` : ''}`}
      onClick={() => onSelect(person.id)}
    >
      <span className="person-card__name">
        {person.given_names} {person.family_name}
      </span>
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

// Arbre récursif horizontal : la personne à gauche, ses parents (ou enfants) à droite.
function Branch({ person, linksOf, sosa, branch, focus, onSelect, withSosa, showSosa = true }) {
  const linked = linksOf.get(person.id) ?? [];
  const ordered = withSosa
    ? [...linked].sort((a, b) => (a.sex === 'F' ? 1 : 0) - (b.sex === 'F' ? 1 : 0))
    : linked;
  return (
    <div className="tree-branch">
      <TreeNode person={person} sosa={sosa} branch={branch} focus={focus} onSelect={onSelect} />
      {ordered.length > 0 ? (
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
}) {
  const [mode, setMode] = useState(defaultMode);
  const [depth, setDepth] = useState(defaultDepth);
  const [items, setItems] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef(null);

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

  const linksOf = new Map();
  for (const item of items ?? []) {
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
    content = <FanChart root={selected} items={items} onSelect={onSelect} />;
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
        />
      </>
    );
  }

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
      </div>
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
          className="tree-stage"
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}
        >
          {content}
        </div>
      </div>
      {/* eslint-enable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */}
    </div>
  );
}
