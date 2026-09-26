import { validateTimeline } from './timeline-validation.js';
import { NotFoundError, ValidationError } from '../errors.js';

export class GenealogyGraphService {
  constructor(database) {
    this.database = database;
  }

  getPerson(personId) {
    const person = this.database
      .prepare('SELECT * FROM persons WHERE id = ? AND deleted_at IS NULL')
      .get(personId);
    if (!person) throw new NotFoundError(`Personne introuvable : ${personId}`);
    return person;
  }

  getParents(personId) {
    this.getPerson(personId);
    return this.database
      .prepare(
        `SELECT p.*, pa.parent_role, pa.link_type, pa.union_id
         FROM parentages pa
         JOIN persons p ON p.id = pa.parent_id AND p.deleted_at IS NULL
         WHERE pa.child_id = ? AND pa.deleted_at IS NULL
         ORDER BY p.family_name, p.given_names`,
      )
      .all(personId);
  }

  getChildren(personId) {
    this.getPerson(personId);
    return this.database
      .prepare(
        `SELECT p.*, pa.parent_role, pa.link_type, pa.union_id
         FROM parentages pa
         JOIN persons p ON p.id = pa.child_id AND p.deleted_at IS NULL
         WHERE pa.parent_id = ? AND pa.deleted_at IS NULL
         ORDER BY p.family_name, p.given_names`,
      )
      .all(personId);
  }

  getSpouses(personId) {
    this.getPerson(personId);
    return this.database
      .prepare(
        `SELECT DISTINCT p.*, u.id AS union_id, u.type AS union_type
         FROM union_partners current_partner
         JOIN union_partners other_partner
           ON other_partner.union_id = current_partner.union_id
          AND other_partner.person_id != current_partner.person_id
          AND other_partner.deleted_at IS NULL
         JOIN persons p ON p.id = other_partner.person_id AND p.deleted_at IS NULL
         JOIN unions u ON u.id = current_partner.union_id AND u.deleted_at IS NULL
         WHERE current_partner.person_id = ? AND current_partner.deleted_at IS NULL
         ORDER BY p.family_name, p.given_names`,
      )
      .all(personId);
  }

  getSiblings(personId) {
    this.getPerson(personId);
    return this.database
      .prepare(
        `SELECT DISTINCT sibling.*
         FROM parentages mine
         JOIN parentages theirs ON theirs.parent_id = mine.parent_id
         JOIN persons sibling ON sibling.id = theirs.child_id AND sibling.deleted_at IS NULL
         WHERE mine.child_id = ?
           AND theirs.child_id != ?
           AND mine.deleted_at IS NULL
           AND theirs.deleted_at IS NULL
         ORDER BY sibling.family_name, sibling.given_names`,
      )
      .all(personId, personId);
  }

  traverse(personId, direction, { maxDepth } = {}) {
    this.getPerson(personId);
    if (maxDepth !== undefined && (!Number.isInteger(maxDepth) || maxDepth < 0)) {
      throw new ValidationError('La profondeur doit être un entier positif ou nul');
    }
    const result = [];
    const seen = new Set([personId]);
    const queue = [{ id: personId, generation: 0 }];
    while (queue.length > 0) {
      const current = queue.shift();
      if (maxDepth !== undefined && current.generation >= maxDepth) continue;
      const relatives =
        direction === 'up' ? this.getParents(current.id) : this.getChildren(current.id);
      for (const relative of relatives) {
        if (seen.has(relative.id)) continue;
        seen.add(relative.id);
        // viaId : personne depuis laquelle on a atteint ce parent/enfant, pour
        // permettre au client de dessiner l'arbre génération par génération.
        const item = { ...relative, generation: current.generation + 1, viaId: current.id };
        result.push(item);
        queue.push(item);
      }
    }
    return result;
  }

  getAncestors(personId, options = {}) {
    return this.traverse(personId, 'up', options);
  }

  getDescendants(personId, options = {}) {
    return this.traverse(personId, 'down', options);
  }

  getRelations(personId) {
    return {
      person: this.getPerson(personId),
      parents: this.getParents(personId),
      children: this.getChildren(personId),
      siblings: this.getSiblings(personId),
      spouses: this.getSpouses(personId),
    };
  }

  findPath(personA, personB) {
    this.getPerson(personA);
    this.getPerson(personB);
    if (personA === personB) return [{ personId: personA, via: 'SELF' }];

    const queue = [personA];
    const previous = new Map([[personA, null]]);
    while (queue.length > 0) {
      const current = queue.shift();
      const neighbours = [
        ...this.getParents(current).map((person) => ({ id: person.id, via: 'PARENT' })),
        ...this.getChildren(current).map((person) => ({ id: person.id, via: 'CHILD' })),
        ...this.getSpouses(current).map((person) => ({ id: person.id, via: 'SPOUSE' })),
      ];
      for (const neighbour of neighbours) {
        if (previous.has(neighbour.id)) continue;
        previous.set(neighbour.id, { id: current, via: neighbour.via });
        if (neighbour.id === personB) {
          const path = [{ personId: personB, via: neighbour.via }];
          let cursor = current;
          while (cursor !== personA) {
            const step = previous.get(cursor);
            path.push({ personId: cursor, via: step.via });
            cursor = step.id;
          }
          path.push({ personId: personA, via: 'START' });
          return path.reverse();
        }
        queue.push(neighbour.id);
      }
    }
    return [];
  }

  findCommonAncestors(personA, personB) {
    const ancestorsA = new Map(this.getAncestors(personA).map((person) => [person.id, person]));
    return this.getAncestors(personB)
      .filter((person) => ancestorsA.has(person.id))
      .map((person) => ({
        person: { ...person },
        generationFromA: ancestorsA.get(person.id).generation,
        generationFromB: person.generation,
      }));
  }

  getParentRole(childId, parentId) {
    const row = this.database
      .prepare(
        `SELECT parent_role FROM parentages
         WHERE child_id = ? AND parent_id = ? AND deleted_at IS NULL`,
      )
      .get(childId, parentId);
    return row?.parent_role ?? null;
  }

  getLinkType(childId, parentId) {
    const row = this.database
      .prepare(
        `SELECT link_type FROM parentages
         WHERE child_id = ? AND parent_id = ? AND deleted_at IS NULL`,
      )
      .get(childId, parentId);
    return row?.link_type ?? null;
  }

  // Qualifie le libellé « parent »/« enfant » d'après la nature réelle du
  // lien de filiation (parentages.link_type) : une filiation adoptive,
  // nourricière ou par recomposition familiale (STEP) n'est jamais présentée
  // comme biologique par défaut, et un lien resté UNKNOWN le dit explicitement
  // plutôt que de laisser croire à une filiation biologique certaine.
  qualifyKinshipLabel(base, linkType) {
    if (linkType === 'ADOPTIVE') return `${base} adoptif`;
    if (linkType === 'FOSTER') return `${base} nourricier`;
    if (linkType === 'STEP') return `${base} par alliance (famille recomposée)`;
    if (linkType === 'UNKNOWN') return `${base} (lien de filiation non précisé)`;
    return base;
  }

  branchOf(role) {
    if (role === 'FATHER') return 'PATERNAL';
    if (role === 'MOTHER') return 'MATERNAL';
    return 'UNKNOWN';
  }

  // Nomme en français le degré de parenté collatérale de personB vis-à-vis de
  // personA, à partir du nombre de générations remontées (up, jusqu'à
  // l'ancêtre commun) puis redescendues (down). Ne couvre que les cas
  // canoniques (aucune alliance/SPOUSE dans le chemin) : au-delà des degrés
  // usuels, renvoie une étiquette honnête et générique plutôt que d'inventer
  // un terme incertain.
  collateralLabel(up, down, sex) {
    const isFeminine = sex === 'F';
    const isMasculine = sex === 'M';
    const pick = (masculine, feminine, neutral) => {
      if (isMasculine) return masculine;
      if (isFeminine) return feminine;
      return neutral ?? `${masculine} ou ${feminine}`;
    };
    const [younger, older] = up <= down ? [up, down] : [down, up];
    const personBIsOlderBranch = down < up;

    if (younger === 1 && older === 1) return pick('frère', 'sœur');
    if (younger === 1 && older === 2) {
      return personBIsOlderBranch ? pick('oncle', 'tante') : pick('neveu', 'nièce');
    }
    if (younger === 1 && older === 3) {
      return personBIsOlderBranch
        ? pick('grand-oncle', 'grand-tante')
        : pick('petit-neveu', 'petite-nièce');
    }
    if (younger === 2 && older === 2) return pick('cousin germain', 'cousine germaine');
    if (younger === 2 && older === 3) {
      return pick('cousin issu de germain', 'cousine issue de germaine');
    }
    return pick(
      `cousin éloigné (${up}×${down})`,
      `cousine éloignée (${up}×${down})`,
      `cousin(e) éloigné(e) (${up}×${down})`,
    );
  }

  findRelationship(personA, personB) {
    const path = this.findPath(personA, personB);
    if (path.length === 0)
      return { relationship: null, distance: null, path, branch: null, label: null };
    const edges = path.slice(1).map((step) => step.via);
    let relationship = 'CONNECTED';
    let branch = null;
    let label = null;
    let linkType = null;
    if (edges.length === 1 && edges[0] === 'SPOUSE') {
      relationship = 'SPOUSE';
      label = 'conjoint(e)';
    } else if (edges.every((edge) => edge === 'PARENT')) {
      relationship = `ANCESTOR_${edges.length}`;
      branch = this.branchOf(this.getParentRole(personA, path[1].personId));
      if (edges.length === 1) {
        linkType = this.getLinkType(personA, path[1].personId);
        label = this.qualifyKinshipLabel('parent', linkType);
      } else {
        label = edges.length === 2 ? 'grand-parent' : null;
      }
    } else if (edges.every((edge) => edge === 'CHILD')) {
      relationship = `DESCENDANT_${edges.length}`;
      branch = this.branchOf(this.getParentRole(path[1].personId, personA));
      if (edges.length === 1) {
        linkType = this.getLinkType(path[1].personId, personA);
        label = this.qualifyKinshipLabel('enfant', linkType);
      } else {
        label = edges.length === 2 ? 'petit-enfant' : null;
      }
    } else if (edges.includes('PARENT') && edges.includes('CHILD')) {
      relationship = 'COLLATERAL';
      branch = this.branchOf(this.getParentRole(personA, path[1].personId));
      let up = 0;
      while (up < edges.length && edges[up] === 'PARENT') up += 1;
      const canonical = edges.slice(up).every((edge) => edge === 'CHILD');
      if (canonical) {
        const down = edges.length - up;
        label = this.collateralLabel(up, down, this.getPerson(personB).sex);
      }
    }
    return { relationship, distance: edges.length, path, branch, label, linkType };
  }

  // Parcours en profondeur ITÉRATIF à trois couleurs (blanc/gris/noir),
  // linéaire en O(personnes + liens) et sans récursion (donc sans limite de
  // pile ni ré-exploration redondante d'un sous-arbre déjà validé) : chaque
  // nœud n'est visité qu'une fois grâce à la mémoire globale `color`.
  detectCycles() {
    const parentages = this.database
      .prepare('SELECT child_id, parent_id FROM parentages WHERE deleted_at IS NULL')
      .all();
    const parentsByChild = new Map();
    for (const { child_id: childId, parent_id: parentId } of parentages) {
      if (!parentsByChild.has(childId)) parentsByChild.set(childId, []);
      parentsByChild.get(childId).push(parentId);
    }

    const WHITE = 0; // jamais visité
    const GRAY = 1; // sur la pile d'exploration courante (chemin actif)
    const BLACK = 2; // entièrement exploré, sans cycle possible depuis ce nœud
    const color = new Map();
    const cycles = [];

    for (const startId of parentsByChild.keys()) {
      if (color.get(startId) === BLACK) continue;
      // Pile explicite : { id, parentIndex } où parentIndex est l'index du
      // prochain parent à explorer pour ce nœud (permet de reprendre après
      // un appel récursif simulé, sans jamais utiliser la pile d'appel JS).
      const stack = [{ id: startId, parentIndex: 0 }];
      color.set(startId, GRAY);

      while (stack.length > 0) {
        const frame = stack[stack.length - 1];
        const parents = parentsByChild.get(frame.id) ?? [];
        if (frame.parentIndex >= parents.length) {
          color.set(frame.id, BLACK);
          stack.pop();
          continue;
        }
        const parentId = parents[frame.parentIndex];
        frame.parentIndex += 1;
        const parentColor = color.get(parentId) ?? WHITE;
        if (parentColor === GRAY) {
          // Cycle détecté : le chemin actif contient déjà `parentId`.
          const pathIds = stack.map((f) => f.id);
          const cycleStart = pathIds.indexOf(parentId);
          cycles.push([...pathIds.slice(cycleStart), parentId]);
        } else if (parentColor === WHITE) {
          color.set(parentId, GRAY);
          stack.push({ id: parentId, parentIndex: 0 });
        }
        // BLACK : sous-arbre déjà validé sans cycle, rien à refaire.
      }
    }
    return cycles;
  }

  /**
   * Réseau familial autour d'une personne (distance ≤ depth) : nœuds avec
   * leur distance et arêtes typées (filiation biologique, adoptive,
   * nourricière, par alliance, inconnue ; union), pour la vue graphe.
   */
  getNetwork(personId, { depth = 2 } = {}) {
    this.getPerson(personId);
    if (!Number.isInteger(depth) || depth < 1 || depth > 6) {
      throw new ValidationError('La profondeur du graphe doit être comprise entre 1 et 6');
    }
    const parentages = this.database
      .prepare(
        `SELECT child_id, parent_id, link_type FROM parentages pa
         JOIN persons c ON c.id = pa.child_id AND c.deleted_at IS NULL
         JOIN persons p ON p.id = pa.parent_id AND p.deleted_at IS NULL
         WHERE pa.deleted_at IS NULL`,
      )
      .all();
    const partners = this.database
      .prepare(
        `SELECT a.person_id AS a, b.person_id AS b
         FROM union_partners a
         JOIN union_partners b ON b.union_id = a.union_id AND b.person_id > a.person_id AND b.deleted_at IS NULL
         JOIN unions u ON u.id = a.union_id AND u.deleted_at IS NULL
         WHERE a.deleted_at IS NULL`,
      )
      .all();
    const adjacency = new Map();
    const link = (from, to) => {
      if (!adjacency.has(from)) adjacency.set(from, new Set());
      adjacency.get(from).add(to);
    };
    for (const edge of parentages) {
      link(edge.child_id, edge.parent_id);
      link(edge.parent_id, edge.child_id);
    }
    for (const edge of partners) {
      link(edge.a, edge.b);
      link(edge.b, edge.a);
    }
    const distance = new Map([[personId, 0]]);
    const queue = [personId];
    while (queue.length > 0) {
      const current = queue.shift();
      if (distance.get(current) >= depth) continue;
      for (const next of adjacency.get(current) ?? []) {
        if (distance.has(next)) continue;
        distance.set(next, distance.get(current) + 1);
        queue.push(next);
      }
    }
    const ids = [...distance.keys()];
    const persons = this.database
      .prepare(
        `SELECT id, given_names, family_name, sex, portrait_media_id FROM persons
         WHERE deleted_at IS NULL AND id IN (${ids.map(() => '?').join(',')})`,
      )
      .all(...ids);
    const inside = (id) => distance.has(id);
    return {
      rootId: personId,
      nodes: persons.map((person) => ({ ...person, distance: distance.get(person.id) })),
      edges: [
        ...parentages
          .filter((edge) => inside(edge.child_id) && inside(edge.parent_id))
          .map((edge) => ({
            from: edge.parent_id,
            to: edge.child_id,
            kind: 'PARENT',
            linkType: edge.link_type,
          })),
        ...partners
          .filter((edge) => inside(edge.a) && inside(edge.b))
          .map((edge) => ({ from: edge.a, to: edge.b, kind: 'SPOUSE' })),
      ],
    };
  }

  validateTimeline() {
    return validateTimeline(this.database);
  }

  assertPair(personA, personB) {
    if (!Number.isInteger(personA) || !Number.isInteger(personB)) {
      throw new ValidationError('Les identifiants des deux personnes doivent être numériques');
    }
  }
}
