import { useCallback, useEffect, useRef, useState } from 'react';

const MODES = [
  { id: 'family', label: 'Familial' },
  { id: 'ancestors', label: 'Ascendant' },
  { id: 'descendants', label: 'Descendant' },
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
function Branch({ person, linksOf, sosa, branch, focus, onSelect, withSosa }) {
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
              withSosa && sosa
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
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function TreeExplorer({ client, selected, onSelect, familyView }) {
  const [mode, setMode] = useState('family');
  const [depth, setDepth] = useState(4);
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
      mode === 'ancestors'
        ? client.graph.ancestors(selected.id, depth)
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
          sosa={mode === 'ancestors' ? 1 : null}
          focus
          onSelect={onSelect}
          withSosa={mode === 'ancestors'}
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
