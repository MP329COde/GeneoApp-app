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
import { useI18n } from '../design-system/index.js';
import { RadialGraph } from './RadialGraph.jsx';
import { PortraitAvatar } from './DocumentTools.jsx';

const MODES = [
  { id: 'family', label: 'Familial' },
  { id: 'ancestors', label: 'Ascendant' },
  { id: 'descendants', label: 'Descendant' },
  { id: 'fan', label: 'Éventail' },
  { id: 'graph', label: 'Graphe' },
];
const EMPTY_ISSUES = new Map();
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 2;

function clampZoom(value) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value * 1000) / 1000));
}

// Réglages d'affichage partagés par tous les nœuds (années, repli, période).
const TreeViewContext = createContext({
  lifespans: new Map(),
  collapsed: new Set(),
  toggle: () => {},
  period: null,
  issues: new Map(),
  client: null,
});

function outsidePeriod(lifespan, period) {
  if (!period || !lifespan?.birthYear) return false;
  return (
    (period.from !== null && lifespan.birthYear < period.from) ||
    (period.to !== null && lifespan.birthYear > period.to)
  );
}

function TreeNode({ person, sosa, sosaAmbiguous, branch, focus, onSelect }) {
  const { lifespans, period, issues, client } = useContext(TreeViewContext);
  const lifespan = lifespans.get(person.id);
  const issueCount = issues.get(person.id)?.length ?? 0;
  const dimmed = outsidePeriod(lifespan, period);
  return (
    <button
      type="button"
      className={`tree-node${focus ? ' tree-node--focus' : ''}${branch ? ` tree-node--${branch}` : ''}${dimmed ? ' tree-node--dimmed' : ''}`}
      onClick={() => onSelect(person.id)}
    >
      {person.portrait_media_id ? (
        <PortraitAvatar client={client} person={person} size={40} />
      ) : null}
      <span className="person-card__name">
        {person.given_names} {person.family_name}
      </span>
      {lifespan ? <span className="person-card__years">{lifespan.label}</span> : null}
      {dimmed ? <span className="gds-visually-hidden"> (hors de la période filtrée)</span> : null}
      {issueCount ? (
        <span className="issue-dot" title={`${issueCount} point(s) à vérifier`}>
          <span className="gds-visually-hidden">{issueCount} point(s) à vérifier</span>
        </span>
      ) : null}
      <span className="tree-node__meta">
        {branch ? (
          <span
            className="tree-node__branch"
            aria-label={branch === 'paternal' ? 'Branche paternelle' : 'Branche maternelle'}
          >
            {branch === 'paternal' ? 'P' : 'M'}
          </span>
        ) : null}
        {sosa ? (
          <span className="data-id">Sosa {sosa}</span>
        ) : sosaAmbiguous ? (
          <span
            className="data-id"
            title="Filiation père/mère non déterminée pour ce parent (rôle inconnu ou ambigu) : aucun numéro Sosa fiable ne peut être attribué."
          >
            Sosa indéterminé
          </span>
        ) : null}
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
  sosaAmbiguous = false,
  branch,
  focus,
  onSelect,
  withSosa,
  showSosa = true,
  relation,
}) {
  const { collapsed, toggle } = useContext(TreeViewContext);
  const linked = linksOf.get(person.id) ?? [];
  const parentSlots = withSosa ? assignParentSlots(linked) : new Map();
  const ordered = withSosa
    ? [...linked].sort((a, b) => (parentSlots.get(a.id) ?? 2) - (parentSlots.get(b.id) ?? 2))
    : linked;
  const isCollapsed = collapsed.has(person.id);
  const name = `${person.given_names} ${person.family_name}`;
  return (
    <div className="tree-branch">
      <TreeNode
        person={person}
        sosa={sosa}
        sosaAmbiguous={sosaAmbiguous}
        branch={branch}
        focus={focus}
        onSelect={onSelect}
      />
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
          {ordered.map((relative) => {
            const slot = parentSlots.get(relative.id);
            const childSosa =
              withSosa && showSosa && sosa && slot !== undefined ? sosa * 2 + slot : null;
            const childAmbiguous = withSosa && showSosa && Boolean(sosa) && slot === undefined;
            const childBranch =
              branch ??
              (withSosa && slot !== undefined ? (slot === 1 ? 'maternal' : 'paternal') : null);
            return (
              <Branch
                key={relative.id}
                person={relative}
                linksOf={linksOf}
                sosa={childSosa}
                sosaAmbiguous={childAmbiguous}
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

// Détermine, pour un groupe de parents d'une même personne, quel parent
// occupe canoniquement le rang « père » (slot 0) et lequel occupe le rang
// « mère » (slot 1). Priorité au lien de filiation réel (parent_role :
// FATHER/MOTHER) ; le sexe ne sert qu'à départager un parent resté au rôle
// générique « PARENT » (saisie non renseignée), jamais à contredire un rôle
// explicite (deux pères déclarés FATHER restent deux pères, pas un
// « père »+« mère » forcés par le sexe). Un parent dont le rang ne peut
// toujours pas être déterminé sans ambiguïté (rôle générique et sexe non
// concluant, ou plusieurs parents du même rôle explicite) n'obtient aucun
// slot plutôt qu'un numéro Sosa inventé.
function assignParentSlots(parents) {
  const fathers = parents.filter((p) => p.parent_role === 'FATHER');
  const mothers = parents.filter((p) => p.parent_role === 'MOTHER');
  const generic = parents.filter((p) => p.parent_role !== 'FATHER' && p.parent_role !== 'MOTHER');

  const slots = new Map();
  if (fathers.length === 1) slots.set(fathers[0].id, 0);
  if (mothers.length === 1) slots.set(mothers[0].id, 1);

  // Repli sur le sexe pour les rôles génériques uniquement, tant qu'un rang
  // reste ouvert et qu'un seul candidat de ce sexe le réclame.
  for (const [slot, wantedSex] of [
    [0, 'M'],
    [1, 'F'],
  ]) {
    if ([...slots.values()].includes(slot)) continue;
    const candidates = generic.filter((p) => !slots.has(p.id) && p.sex === wantedSex);
    if (candidates.length === 1) slots.set(candidates[0].id, slot);
  }

  // Dernier recours : un seul parent générique restant et un seul rang encore
  // ouvert — la seule affectation possible, sans ambiguïté.
  const openSlots = [0, 1].filter((slot) => ![...slots.values()].includes(slot));
  const stillGeneric = generic.filter((p) => !slots.has(p.id));
  if (stillGeneric.length === 1 && openSlots.length === 1) {
    slots.set(stillGeneric[0].id, openSlots[0]);
  }
  return slots;
}

// Numérotation Sosa-Stradonitz : père = 2n, mère = 2n + 1, d'après le rôle de
// filiation réel de chaque parent (parent_role), jamais son sexe déclaré —
// deux pères, deux mères ou une filiation au rôle inconnu ne reçoivent un
// numéro Sosa que lorsque le rang « père »/« mère » est déterminable sans
// ambiguïté ; sinon ce parent est absent de la carte retournée (pas de faux
// numéro Sosa).
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
    const slots = assignParentSlots(parents);
    for (const parent of parents) {
      if (sosa.has(parent.id)) continue;
      const slot = slots.get(parent.id);
      if (slot === undefined) continue;
      sosa.set(parent.id, sosa.get(id) * 2 + slot);
      queue.push(parent.id);
    }
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
  refreshKey = 0,
  issues = EMPTY_ISSUES,
}) {
  const { t } = useI18n();
  // Le mode choisi survit au passage par une autre vue pendant la session.
  const [mode, setModeState] = useState(() => {
    try {
      return window.sessionStorage.getItem('geneoapp:treeMode') ?? defaultMode;
    } catch {
      return defaultMode;
    }
  });
  const setMode = (next) => {
    setModeState(next);
    try {
      window.sessionStorage.setItem('geneoapp:treeMode', next);
    } catch {
      // confort uniquement
    }
  };
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
  // Données chargées avec leur mode et leur racine : pendant le chargement
  // suivant, l'ancien arbre reste affiché (atténué) au lieu de disparaître.
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [panning, setPanning] = useState(false);
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
    // On garde l'arbre précédent affiché pendant le chargement (pas de saut).
    setLoading(true);
    setLoadError(null);
    const request =
      mode === 'graph'
        ? client.graph.network(selected.id, Math.min(depth, 6))
        : mode === 'ancestors' || mode === 'fan'
          ? client.graph.ancestors(selected.id, mode === 'fan' ? Math.min(depth, 6) : depth)
          : client.graph.descendants(selected.id, depth);
    request
      .then((list) => {
        if (cancelled) return;
        setData({ mode, root: selected, items: list });
      })
      .catch((error) => !cancelled && setLoadError(error.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // selected?.id : ne recharger que si la personne change réellement.
  }, [client, mode, depth, selected?.id, refreshKey]);

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
  // Pendant un geste continu, la transition CSS est coupée (sinon saccades).
  const viewportRef = useRef(null);
  const wheelIdle = useRef(null);
  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return undefined;
    const handleWheel = (event) => {
      event.preventDefault();
      setPanning(true);
      clearTimeout(wheelIdle.current);
      wheelIdle.current = setTimeout(() => setPanning(false), 160);
      if (event.ctrlKey || event.metaKey) {
        setZoom((current) => clampZoom(current * Math.exp(-event.deltaY * 0.0025)));
      } else {
        setOffset((current) => ({ x: current.x - event.deltaX, y: current.y - event.deltaY }));
      }
    };
    node.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      node.removeEventListener('wheel', handleWheel);
      clearTimeout(wheelIdle.current);
    };
  }, []);

  // Glisser : le déplacement n'est appliqué qu'une fois par image, directement
  // sur le style, et validé dans l'état au relâchement. Un clic (sans
  // mouvement) reste un clic, y compris sur les secteurs SVG de l'éventail.
  const frame = useRef(null);
  const applyStageTransform = (next) => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      if (stageRef.current) {
        stageRef.current.style.transform = `translate(${next.x}px, ${next.y}px) scale(${zoom})`;
      }
    });
  };
  const handlePointerDown = (event) => {
    if (event.button !== 0 || event.target.closest('button, [role="button"], a, input, select')) {
      return;
    }
    drag.current = {
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX - offset.x,
      y: event.clientY - offset.y,
      moved: false,
      pointerId: event.pointerId,
    };
  };
  const handlePointerMove = (event) => {
    const current = drag.current;
    if (!current) return;
    if (!current.moved) {
      if (Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < 4) return;
      current.moved = true;
      event.currentTarget.setPointerCapture?.(current.pointerId);
      setPanning(true);
    }
    current.last = { x: event.clientX - current.x, y: event.clientY - current.y };
    applyStageTransform(current.last);
  };
  const handlePointerUp = () => {
    const current = drag.current;
    drag.current = null;
    if (!current?.moved) return;
    cancelAnimationFrame(frame.current);
    if (current.last) setOffset(current.last);
    setPanning(false);
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
  const itemsReady = data !== null && data.mode === mode;
  const items = itemsReady ? data.items : null;
  const root = itemsReady ? data.root : selected;
  let visibleItems = itemsReady && Array.isArray(items) ? items : [];
  if (root && branchFilter !== 'all' && (mode === 'ancestors' || mode === 'fan')) {
    const sosa = computeSosa(root.id, visibleItems);
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
  } else if (!itemsReady) {
    content = (
      <p role="status" className="loading-line">
        Chargement de l’arbre…
      </p>
    );
  } else if (mode === 'graph') {
    content = items?.nodes ? (
      <RadialGraph network={items} lifespans={lifespans} onSelect={onSelect} />
    ) : null;
  } else if (mode === 'fan') {
    content = <FanChart root={root} items={visibleItems} onSelect={onSelect} />;
  } else {
    content = (
      <>
        {items.length === 0 ? (
          <p className="notice">
            {mode === 'ancestors' ? 'Aucun ancêtre enregistré.' : 'Aucun descendant enregistré.'}
          </p>
        ) : null}
        <Branch
          person={root}
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

  // Mesure de l'arbre pour la minicarte (coordonnées non zoomées) : seulement
  // quand le contenu change, jamais pendant un déplacement.
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const node = viewportRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setViewportSize((current) =>
        current.width === width && current.height === height ? current : { width, height },
      );
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const contentKey = `${mode}|${root?.id}|${itemsReady}|${items?.length ?? items?.nodes?.length}|${[...collapsed].join(',')}|${branchFilter}|${refreshKey}`;
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
  }, [contentKey, viewportSize]);

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
              {t(`tree.${item.id}`, item.label)}
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
              onChange={(event) =>
                setDepth(Math.min(30, Math.max(1, Number(event.target.value) || 1)))
              }
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
        className={`tree-viewport${panning ? ' is-panning' : ''}${loading ? ' is-loading' : ''}`}
        aria-busy={loading}
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
            value={{ lifespans, collapsed, toggle: toggleCollapsed, period, issues, client }}
          >
            {/* La clé rejoue l'animation d'entrée à chaque nouvelle vue. */}
            <div
              key={`${mode}-${itemsReady ? root?.id : selected?.id}`}
              className="tree-stage__content"
            >
              {content}
            </div>
          </TreeViewContext.Provider>
        </div>
      </div>
      {/* eslint-enable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */}
      {/* Minicarte seulement quand l'arbre dépasse la zone visible. */}
      {layout &&
      layout.boxes.length > 0 &&
      (layout.width * zoom > layout.viewWidth || layout.height * zoom > layout.viewHeight) ? (
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
