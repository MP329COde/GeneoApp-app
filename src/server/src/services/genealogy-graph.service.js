import { NotFoundError, ValidationError } from '../errors.js';

const YEAR_PATTERN = /(?:^|\D)(\d{4})(?:\D|$)/;

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
        const item = { ...relative, generation: current.generation + 1 };
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

  branchOf(role) {
    if (role === 'FATHER') return 'PATERNAL';
    if (role === 'MOTHER') return 'MATERNAL';
    return 'UNKNOWN';
  }

  findRelationship(personA, personB) {
    const path = this.findPath(personA, personB);
    if (path.length === 0) return { relationship: null, distance: null, path, branch: null };
    const edges = path.slice(1).map((step) => step.via);
    let relationship = 'CONNECTED';
    let branch = null;
    if (edges.length === 1 && edges[0] === 'SPOUSE') relationship = 'SPOUSE';
    else if (edges.every((edge) => edge === 'PARENT')) {
      relationship = `ANCESTOR_${edges.length}`;
      branch = this.branchOf(this.getParentRole(personA, path[1].personId));
    } else if (edges.every((edge) => edge === 'CHILD')) {
      relationship = `DESCENDANT_${edges.length}`;
      branch = this.branchOf(this.getParentRole(path[1].personId, personA));
    } else if (edges.includes('PARENT') && edges.includes('CHILD')) {
      relationship = 'COLLATERAL';
      branch = this.branchOf(this.getParentRole(personA, path[1].personId));
    }
    return { relationship, distance: edges.length, path, branch };
  }

  detectCycles() {
    const parentages = this.database
      .prepare('SELECT child_id, parent_id FROM parentages WHERE deleted_at IS NULL')
      .all();
    const parentsByChild = new Map();
    for (const { child_id: childId, parent_id: parentId } of parentages) {
      if (!parentsByChild.has(childId)) parentsByChild.set(childId, []);
      parentsByChild.get(childId).push(parentId);
    }
    const cycles = [];
    const visit = (personId, path, active) => {
      if (active.has(personId)) {
        cycles.push([...path.slice(path.indexOf(personId)), personId]);
        return;
      }
      if (path.includes(personId)) return;
      active.add(personId);
      for (const parentId of parentsByChild.get(personId) ?? []) {
        visit(parentId, [...path, personId], active);
      }
      active.delete(personId);
    };
    for (const personId of parentsByChild.keys()) visit(personId, [], new Set());
    return cycles;
  }

  validateTimeline() {
    const persons = this.database.prepare('SELECT id FROM persons WHERE deleted_at IS NULL').all();
    const events = this.database
      .prepare(
        `SELECT ep.person_id, e.type, e.date_text
         FROM event_participants ep
         JOIN events e ON e.id = ep.event_id AND e.deleted_at IS NULL
         WHERE ep.deleted_at IS NULL`,
      )
      .all();
    const byPerson = new Map(persons.map(({ id }) => [id, {}]));
    for (const event of events) {
      const year = event.date_text?.match(YEAR_PATTERN)?.[1];
      if (year && byPerson.has(event.person_id))
        byPerson.get(event.person_id)[event.type] = Number(year);
    }
    const issues = [];
    for (const [personId, timeline] of byPerson) {
      if (timeline.BIRTH && timeline.DEATH && timeline.BIRTH > timeline.DEATH) {
        issues.push({ personId, code: 'BIRTH_AFTER_DEATH', severity: 'CERTAIN' });
      }
      if (timeline.MARRIAGE && timeline.DEATH && timeline.MARRIAGE > timeline.DEATH) {
        issues.push({ personId, code: 'MARRIAGE_AFTER_DEATH', severity: 'CERTAIN' });
      }
    }
    for (const parentage of this.database
      .prepare(
        `SELECT pa.parent_id, pa.child_id, child_birth.date_text AS child_birth_date,
                parent_death.date_text AS parent_death_date
         FROM parentages pa
         JOIN persons child ON child.id = pa.child_id AND child.deleted_at IS NULL
         LEFT JOIN event_participants child_ep ON child_ep.person_id = child.id AND child_ep.deleted_at IS NULL
         LEFT JOIN events child_birth ON child_birth.id = child_ep.event_id AND child_birth.type = 'BIRTH' AND child_birth.deleted_at IS NULL
         LEFT JOIN event_participants parent_ep ON parent_ep.person_id = pa.parent_id AND parent_ep.deleted_at IS NULL
         LEFT JOIN events parent_death ON parent_death.id = parent_ep.event_id AND parent_death.type = 'DEATH' AND parent_death.deleted_at IS NULL
         WHERE pa.deleted_at IS NULL`,
      )
      .all()) {
      const childYear = parentage.child_birth_date?.match(YEAR_PATTERN)?.[1];
      const parentDeathYear = parentage.parent_death_date?.match(YEAR_PATTERN)?.[1];
      if (childYear && parentDeathYear && Number(childYear) > Number(parentDeathYear)) {
        issues.push({
          parentId: parentage.parent_id,
          childId: parentage.child_id,
          code: 'CHILD_AFTER_PARENT_DEATH',
          severity: 'CERTAIN',
        });
      }
    }
    return issues;
  }

  assertPair(personA, personB) {
    if (!Number.isInteger(personA) || !Number.isInteger(personB)) {
      throw new ValidationError('Les identifiants des deux personnes doivent être numériques');
    }
  }
}
