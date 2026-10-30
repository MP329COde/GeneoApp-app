// Incohérences de RELATIONS (et non de dates) : filiations impossibles ou
// inhabituelles, unions suspectes. Même convention que la validation
// chronologique : CERTAIN = contradiction logique des données ; POSSIBLE =
// situation inhabituelle mais plausible, à vérifier, jamais présentée comme une
// erreur. Rien n'est corrigé automatiquement.

/**
 * @returns {Array<{code, severity, personId?, childId?, parentId?, unionId?, message}>}
 */
export function validateRelations(database) {
  const issues = [];
  const push = (issue) => issues.push(issue);
  const label = new Map(
    database
      .prepare('SELECT id, given_names, family_name, sex FROM persons WHERE deleted_at IS NULL')
      .all()
      .map((person) => [person.id, person]),
  );
  const name = (id) => {
    const person = label.get(id);
    return person ? `${person.given_names} ${person.family_name}`.trim() || `#${id}` : `#${id}`;
  };

  const parentages = database
    .prepare(
      `SELECT id, child_id, parent_id, parent_role, link_type, union_id FROM parentages
       WHERE deleted_at IS NULL ORDER BY id`,
    )
    .all()
    .filter((row) => label.has(row.child_id) && label.has(row.parent_id));

  // 1. Parents biologiques en trop : un enfant n'a qu'un père et qu'une mère biologiques.
  const biologicalByChild = new Map();
  for (const row of parentages.filter((item) => item.link_type === 'BIOLOGICAL')) {
    if (!biologicalByChild.has(row.child_id)) biologicalByChild.set(row.child_id, []);
    biologicalByChild.get(row.child_id).push(row);
  }
  for (const [childId, rows] of biologicalByChild) {
    for (const role of ['FATHER', 'MOTHER']) {
      if (rows.filter((row) => row.parent_role === role).length > 1) {
        push({
          code: role === 'FATHER' ? 'MULTIPLE_BIOLOGICAL_FATHERS' : 'MULTIPLE_BIOLOGICAL_MOTHERS',
          severity: 'CERTAIN',
          personId: childId,
          childId,
          message: `${name(childId)} a plusieurs ${role === 'FATHER' ? 'pères' : 'mères'} biologiques`,
        });
      }
    }
    if (rows.length > 2) {
      push({
        code: 'TOO_MANY_BIOLOGICAL_PARENTS',
        severity: 'CERTAIN',
        personId: childId,
        childId,
        message: `${name(childId)} a ${rows.length} parents biologiques`,
      });
    }
  }

  // 2. Rôle incompatible avec le sexe enregistré : peut être une saisie à vérifier.
  for (const row of parentages) {
    const parent = label.get(row.parent_id);
    if (
      (row.parent_role === 'FATHER' && parent.sex === 'F') ||
      (row.parent_role === 'MOTHER' && parent.sex === 'M')
    ) {
      push({
        code: 'PARENT_ROLE_SEX_MISMATCH',
        severity: 'POSSIBLE',
        personId: row.parent_id,
        childId: row.child_id,
        parentId: row.parent_id,
        message: `${name(row.parent_id)} est notée ${row.parent_role === 'FATHER' ? 'père' : 'mère'} de ${name(row.child_id)} alors que son sexe est ${parent.sex === 'F' ? 'féminin' : 'masculin'}`,
      });
    }
  }

  // 3. Filiation rattachée à une union dont le parent n'est pas partenaire.
  const partnersOf = new Map();
  for (const row of database
    .prepare(
      `SELECT up.union_id, up.person_id FROM union_partners up
       JOIN unions u ON u.id = up.union_id AND u.deleted_at IS NULL
       WHERE up.deleted_at IS NULL`,
    )
    .all()) {
    if (!partnersOf.has(row.union_id)) partnersOf.set(row.union_id, new Set());
    partnersOf.get(row.union_id).add(row.person_id);
  }
  for (const row of parentages.filter((item) => item.union_id !== null)) {
    const partners = partnersOf.get(row.union_id);
    if (partners && !partners.has(row.parent_id)) {
      push({
        code: 'PARENT_NOT_IN_UNION',
        severity: 'CERTAIN',
        personId: row.parent_id,
        childId: row.child_id,
        parentId: row.parent_id,
        unionId: row.union_id,
        message: `${name(row.parent_id)} est parent de ${name(row.child_id)} au titre d'une union dont ${name(row.parent_id)} n'est pas partenaire`,
      });
    }
  }

  // 4. Unions en double (mêmes partenaires) et unions entre proches.
  const unionsByPartners = new Map();
  for (const [unionId, partners] of partnersOf) {
    const key = [...partners].sort((a, b) => a - b).join('-');
    if (!unionsByPartners.has(key)) unionsByPartners.set(key, []);
    unionsByPartners.get(key).push(unionId);
  }
  for (const [key, unionIds] of unionsByPartners) {
    if (unionIds.length > 1) {
      const [first] = key.split('-').map(Number);
      push({
        code: 'DUPLICATE_UNION',
        severity: 'POSSIBLE',
        personId: first,
        unionId: unionIds[0],
        message: `${unionIds.length} unions enregistrées entre les mêmes personnes (${key
          .split('-')
          .map((id) => name(Number(id)))
          .join(', ')})`,
      });
    }
  }

  const parentsOf = new Map();
  for (const row of parentages) {
    if (!parentsOf.has(row.child_id)) parentsOf.set(row.child_id, new Set());
    parentsOf.get(row.child_id).add(row.parent_id);
  }
  const isAncestor = (candidate, person) => {
    const seen = new Set();
    const stack = [...(parentsOf.get(person) ?? [])];
    while (stack.length > 0) {
      const current = stack.pop();
      if (current === candidate) return true;
      if (seen.has(current)) continue;
      seen.add(current);
      stack.push(...(parentsOf.get(current) ?? []));
    }
    return false;
  };
  for (const [unionId, partners] of partnersOf) {
    const members = [...partners].filter((id) => label.has(id));
    for (let i = 0; i < members.length; i += 1) {
      for (let j = i + 1; j < members.length; j += 1) {
        const [a, b] = [members[i], members[j]];
        const sharedParent = [...(parentsOf.get(a) ?? [])].some((p) => parentsOf.get(b)?.has(p));
        if (isAncestor(a, b) || isAncestor(b, a)) {
          push({
            code: 'UNION_BETWEEN_ANCESTOR_AND_DESCENDANT',
            severity: 'POSSIBLE',
            personId: a,
            unionId,
            message: `${name(a)} et ${name(b)} sont en union alors que l'un descend de l'autre`,
          });
        } else if (sharedParent) {
          push({
            code: 'UNION_BETWEEN_SIBLINGS',
            severity: 'POSSIBLE',
            personId: a,
            unionId,
            message: `${name(a)} et ${name(b)} sont en union alors qu'ils ont un parent commun`,
          });
        }
      }
    }
  }
  return issues;
}
