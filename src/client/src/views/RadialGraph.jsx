const RING = 170;
const NODE = { width: 150, height: 44 };

// Style du trait par nature du lien (le motif porte le sens, la couleur le renforce).
const EDGE_STYLES = {
  BIOLOGICAL: { className: 'graph-edge graph-edge--bio' },
  ADOPTIVE: { className: 'graph-edge graph-edge--adoptive', dash: '6 4' },
  FOSTER: { className: 'graph-edge graph-edge--adoptive', dash: '6 4' },
  STEP: { className: 'graph-edge graph-edge--unknown', dash: '10 3 2 3' },
  UNKNOWN: { className: 'graph-edge graph-edge--unknown', dash: '2 3' },
};
const LINK_LABELS = {
  BIOLOGICAL: 'biologique',
  ADOPTIVE: 'adoptive',
  FOSTER: 'nourricière',
  STEP: 'par alliance',
  UNKNOWN: 'de nature inconnue',
};

/** Positions radiales : un anneau par degré, voisins rapprochés angulairement. */
export function layoutRadial(network) {
  const neighbours = new Map();
  for (const edge of network.edges) {
    for (const [a, b] of [
      [edge.from, edge.to],
      [edge.to, edge.from],
    ]) {
      if (!neighbours.has(a)) neighbours.set(a, []);
      neighbours.get(a).push(b);
    }
  }
  const angles = new Map([[network.rootId, 0]]);
  const rings = new Map();
  for (const node of network.nodes) {
    if (!rings.has(node.distance)) rings.set(node.distance, []);
    rings.get(node.distance).push(node);
  }
  const positions = new Map([[network.rootId, { x: 0, y: 0 }]]);
  const maxDistance = Math.max(0, ...rings.keys());
  for (let distance = 1; distance <= maxDistance; distance += 1) {
    const ring = rings.get(distance) ?? [];
    const anchor = (node) => {
      const inner = (neighbours.get(node.id) ?? []).filter((id) => angles.has(id));
      if (inner.length === 0) return 0;
      return inner.reduce((sum, id) => sum + angles.get(id), 0) / inner.length;
    };
    ring.sort((a, b) => anchor(a) - anchor(b) || a.id - b.id);
    const start = ring.length > 0 ? anchor(ring[0]) : 0;
    ring.forEach((node, index) => {
      const angle = start + (index * 2 * Math.PI) / ring.length;
      angles.set(node.id, angle);
      positions.set(node.id, {
        x: Math.cos(angle - Math.PI / 2) * RING * distance,
        y: Math.sin(angle - Math.PI / 2) * RING * distance,
      });
    });
  }
  return { positions, maxDistance };
}

export function RadialGraph({ network, lifespans, onSelect }) {
  const { positions, maxDistance } = layoutRadial(network);
  const extent = RING * Math.max(1, maxDistance) + NODE.width;
  const byId = new Map(network.nodes.map((node) => [node.id, node]));
  const name = (node) => `${node.given_names} ${node.family_name}`;
  const handleKey = (event, id) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(id);
    }
  };
  return (
    <svg
      className="radial-graph"
      viewBox={`${-extent} ${-extent} ${extent * 2} ${extent * 2}`}
      width={extent * 2}
      height={extent * 2}
      role="group"
      aria-label={`Graphe familial de ${name(byId.get(network.rootId))}`}
    >
      {network.edges.map((edge, index) => {
        const a = positions.get(edge.from);
        const b = positions.get(edge.to);
        if (!a || !b) return null;
        if (edge.kind === 'SPOUSE') {
          return (
            <g key={index} className="graph-edge graph-edge--spouse">
              <title>Union</title>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth="5" />
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                strokeWidth="1.5"
                className="graph-edge__gap"
              />
            </g>
          );
        }
        const style = EDGE_STYLES[edge.linkType] ?? EDGE_STYLES.UNKNOWN;
        return (
          <line
            key={index}
            className={style.className}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            strokeDasharray={style.dash}
          >
            <title>Filiation {LINK_LABELS[edge.linkType] ?? 'de nature inconnue'}</title>
          </line>
        );
      })}
      {network.nodes.map((node) => {
        const position = positions.get(node.id);
        const root = node.id === network.rootId;
        const years = lifespans?.get(node.id)?.label;
        return (
          <g
            key={node.id}
            role="button"
            tabIndex={0}
            className={`graph-node${root ? ' graph-node--root' : ''}`}
            transform={`translate(${position.x - NODE.width / 2} ${position.y - NODE.height / 2})`}
            aria-label={`${name(node)}${years ? `, ${years}` : ''}, degré ${node.distance}`}
            onClick={() => onSelect(node.id)}
            onKeyDown={(event) => handleKey(event, node.id)}
          >
            <rect width={NODE.width} height={NODE.height} rx="6" />
            <text x="10" y="19" className="graph-node__name">
              {name(node).length > 20 ? `${name(node).slice(0, 19)}…` : name(node)}
            </text>
            {years ? (
              <text x="10" y="35" className="graph-node__years">
                {years}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
