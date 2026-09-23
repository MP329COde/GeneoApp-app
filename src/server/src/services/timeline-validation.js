import {
  certainOrder,
  compareGenealogyDates,
  formatGenealogyDate,
  parseGenealogyDate,
  yearsBetween,
} from '../../../db/src/dates/genealogy-date.js';

// Seuils démographiques. CERTAIN = impossible ; POSSIBLE = inhabituel, à
// vérifier, mais plausible (ne jamais présenter comme une erreur).
const LIMITS = {
  maxLifespan: 120,
  unusualLifespan: 105,
  minParentAge: 10,
  unusualParentAge: 13,
  unusualMotherAge: 50,
  maxMotherAge: 65,
  unusualFatherAge: 80,
  unusualMarriageAge: 13,
  // Un enfant peut naître jusqu'à ~10 mois après la mort de son père.
  posthumousYears: 10 / 12,
};

function describe(parsed) {
  return formatGenealogyDate(parsed);
}

/**
 * Détecte les incohérences chronologiques d'un arbre en tenant compte de la
 * précision des dates : une contradiction n'est « certaine » que si les
 * intervalles de dates ne se chevauchent pas.
 */
export function validateTimeline(database) {
  const events = database
    .prepare(
      `SELECT ep.person_id, e.id AS event_id, e.type, e.date_text
       FROM event_participants ep
       JOIN events e ON e.id = ep.event_id AND e.deleted_at IS NULL
       JOIN persons p ON p.id = ep.person_id AND p.deleted_at IS NULL
       WHERE ep.deleted_at IS NULL AND e.date_text IS NOT NULL AND e.date_text != ''`,
    )
    .all();

  const byPerson = new Map();
  for (const event of events) {
    const parsed = parseGenealogyDate(event.date_text);
    if (!parsed.valid) continue;
    if (!byPerson.has(event.person_id)) byPerson.set(event.person_id, {});
    const timeline = byPerson.get(event.person_id);
    (timeline[event.type] ??= []).push(parsed);
  }
  const first = (timeline, type) =>
    [...(timeline?.[type] ?? [])].sort(compareGenealogyDates)[0] ?? null;

  const issues = [];
  const push = (issue) => issues.push(issue);

  for (const [personId, timeline] of byPerson) {
    const birth = first(timeline, 'BIRTH');
    const death = first(timeline, 'DEATH');
    const pairCheck = (a, b, code, label) => {
      if (!a || !b) return;
      const order = certainOrder(a, b);
      if (order === 'after') {
        push({
          personId,
          code,
          severity: 'CERTAIN',
          message: `${label} (${describe(a)} / ${describe(b)})`,
        });
      } else if (order === 'unknown' && compareGenealogyDates(a, b) > 0) {
        push({
          personId,
          code,
          severity: 'POSSIBLE',
          message: `${label} selon les dates approximatives (${describe(a)} / ${describe(b)})`,
        });
      }
    };

    pairCheck(birth, death, 'BIRTH_AFTER_DEATH', 'Naissance postérieure au décès');
    for (const baptism of timeline.BAPTISM ?? []) {
      pairCheck(birth, baptism, 'BAPTISM_BEFORE_BIRTH', 'Baptême antérieur à la naissance');
    }
    for (const burial of timeline.BURIAL ?? []) {
      pairCheck(death, burial, 'BURIAL_BEFORE_DEATH', 'Inhumation antérieure au décès');
    }
    for (const marriage of timeline.MARRIAGE ?? []) {
      pairCheck(marriage, death, 'MARRIAGE_AFTER_DEATH', 'Mariage postérieur au décès');
      pairCheck(birth, marriage, 'MARRIAGE_BEFORE_BIRTH', 'Mariage antérieur à la naissance');
      const age = birth ? yearsBetween(birth, marriage) : null;
      if (age && age.min !== null && age.min >= 0 && age.typical < LIMITS.unusualMarriageAge) {
        push({
          personId,
          code: 'MARRIAGE_VERY_YOUNG',
          severity: 'POSSIBLE',
          message: `Mariage vers ${Math.round(age.typical)} ans`,
        });
      }
    }
    if (birth && death) {
      const span = yearsBetween(birth, death);
      if (span?.min !== null && span.min > LIMITS.maxLifespan) {
        push({
          personId,
          code: 'IMPOSSIBLE_AGE',
          severity: 'CERTAIN',
          message: `Âge au décès supérieur à ${LIMITS.maxLifespan} ans`,
        });
      } else if (span && span.typical > LIMITS.unusualLifespan) {
        push({
          personId,
          code: 'IMPOSSIBLE_AGE',
          severity: 'POSSIBLE',
          message: `Âge au décès d’environ ${Math.round(span.typical)} ans`,
        });
      }
    }
    const births = timeline.BIRTH ?? [];
    if (births.length > 1) {
      const incompatible = births.some((a, i) =>
        births.slice(i + 1).some((b) => certainOrder(a, b) !== 'unknown'),
      );
      push({
        personId,
        code: 'MULTIPLE_BIRTHS',
        severity: incompatible ? 'CERTAIN' : 'POSSIBLE',
        message: `${births.length} naissances enregistrées (${births.map(describe).join(', ')})`,
      });
    }
  }

  // Statut « vivant » contredit par les données.
  const currentYear = new Date().getUTCFullYear();
  for (const { id } of database
    .prepare('SELECT id FROM persons WHERE deleted_at IS NULL AND is_living = 1')
    .all()) {
    const timeline = byPerson.get(id);
    if (!timeline) continue;
    if ((timeline.DEATH?.length ?? 0) > 0 || (timeline.BURIAL?.length ?? 0) > 0) {
      push({
        personId: id,
        code: 'LIVING_WITH_DEATH',
        severity: 'CERTAIN',
        message: 'Marquée vivante alors qu’un décès ou une inhumation est enregistré',
      });
      continue;
    }
    const birth = first(timeline, 'BIRTH');
    if (birth?.max !== null && birth && currentYear - Math.floor(birth.max / 372) > 110) {
      push({
        personId: id,
        code: 'LIVING_TOO_OLD',
        severity: 'POSSIBLE',
        message: 'Marquée vivante mais née il y a plus de 110 ans',
      });
    }
  }

  const links = database
    .prepare(
      `SELECT pa.parent_id, pa.child_id, pa.parent_role, parent.sex AS parent_sex
       FROM parentages pa
       JOIN persons parent ON parent.id = pa.parent_id AND parent.deleted_at IS NULL
       JOIN persons child ON child.id = pa.child_id AND child.deleted_at IS NULL
       WHERE pa.deleted_at IS NULL AND pa.link_type IN ('BIOLOGICAL', 'UNKNOWN')`,
    )
    .all();
  for (const link of links) {
    const childBirth = first(byPerson.get(link.child_id), 'BIRTH');
    if (!childBirth) continue;
    const parent = byPerson.get(link.parent_id);
    const parentBirth = first(parent, 'BIRTH');
    const parentDeath = first(parent, 'DEATH');
    const isMother =
      link.parent_role === 'MOTHER' || (link.parent_role === 'PARENT' && link.parent_sex === 'F');
    const base = { parentId: link.parent_id, childId: link.child_id };

    if (parentBirth) {
      if (certainOrder(childBirth, parentBirth) === 'before') {
        push({
          ...base,
          code: 'CHILD_BORN_BEFORE_PARENT',
          severity: 'CERTAIN',
          message: 'Enfant né avant son parent',
        });
      } else {
        const age = yearsBetween(parentBirth, childBirth);
        if (age?.max !== null && age.max < LIMITS.minParentAge && age.max >= 0) {
          push({
            ...base,
            code: 'PARENT_TOO_YOUNG',
            severity: 'CERTAIN',
            message: `Parent âgé de moins de ${LIMITS.minParentAge} ans à la naissance`,
          });
        } else if (age && age.typical >= 0 && age.typical < LIMITS.unusualParentAge) {
          push({
            ...base,
            code: 'PARENT_TOO_YOUNG',
            severity: 'POSSIBLE',
            message: `Parent âgé d’environ ${Math.round(age.typical)} ans à la naissance`,
          });
        } else if (isMother && age?.min !== null && age.min > LIMITS.maxMotherAge) {
          push({
            ...base,
            code: 'PARENT_TOO_OLD',
            severity: 'CERTAIN',
            message: `Mère âgée de plus de ${LIMITS.maxMotherAge} ans à la naissance`,
          });
        } else if (
          age &&
          age.typical > (isMother ? LIMITS.unusualMotherAge : LIMITS.unusualFatherAge)
        ) {
          push({
            ...base,
            code: 'PARENT_TOO_OLD',
            severity: 'POSSIBLE',
            message: `Parent âgé d’environ ${Math.round(age.typical)} ans à la naissance`,
          });
        }
      }
    }
    if (parentDeath && certainOrder(childBirth, parentDeath) === 'after') {
      const gap = yearsBetween(parentDeath, childBirth);
      const certain = isMother || (gap?.min !== null && gap.min > LIMITS.posthumousYears);
      push({
        ...base,
        code: 'CHILD_AFTER_PARENT_DEATH',
        severity: certain ? 'CERTAIN' : 'POSSIBLE',
        message: certain
          ? `Naissance après le décès ${isMother ? 'de la mère' : 'du parent'}`
          : 'Naissance posthume possible (moins de 10 mois après le décès du père)',
      });
    }
  }
  return issues;
}
