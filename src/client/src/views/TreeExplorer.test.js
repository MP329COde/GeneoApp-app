import { describe, expect, test } from 'vitest';
import { computeSosa } from './TreeExplorer.jsx';

// items : { id, viaId, parent_role } — la forme retournée par
// GenealogyGraphService#traverse('up') côté serveur.
function item(id, viaId, parentRole) {
  return { id, viaId, parent_role: parentRole };
}

describe('computeSosa', () => {
  test('cas classique : père = 2, mère = 3', () => {
    const items = [item(2, 1, 'FATHER'), item(3, 1, 'MOTHER')];
    const sosa = computeSosa(1, items);
    expect(sosa.get(1)).toBe(1);
    expect(sosa.get(2)).toBe(2);
    expect(sosa.get(3)).toBe(3);
  });

  test('un seul parent au rôle générique complète le rang restant sans ambiguïté', () => {
    const items = [item(2, 1, 'FATHER'), item(3, 1, 'PARENT')];
    const sosa = computeSosa(1, items);
    expect(sosa.get(2)).toBe(2);
    expect(sosa.get(3)).toBe(3);
  });

  test('deux parents au rôle générique : aucun numéro Sosa fiable ne doit être inventé', () => {
    const items = [item(2, 1, 'PARENT'), item(3, 1, 'PARENT')];
    const sosa = computeSosa(1, items);
    expect(sosa.has(2)).toBe(false);
    expect(sosa.has(3)).toBe(false);
  });

  test('deux pères (famille homoparentale) : aucun des deux ne reçoit un rang de mère fictif', () => {
    const items = [item(2, 1, 'FATHER'), item(3, 1, 'FATHER')];
    const sosa = computeSosa(1, items);
    // Un seul rang « père » (2n) existe canoniquement ; le second père n'a pas
    // de rang « mère » légitime, donc pas de numéro Sosa forcé.
    expect([sosa.get(2), sosa.get(3)].filter((n) => n !== undefined)).toHaveLength(0);
  });

  test('remonte plusieurs générations quand les rôles sont non ambigus', () => {
    const items = [
      item(2, 1, 'FATHER'),
      item(3, 1, 'MOTHER'),
      item(4, 2, 'FATHER'),
      item(5, 2, 'MOTHER'),
    ];
    const sosa = computeSosa(1, items);
    expect(sosa.get(4)).toBe(4);
    expect(sosa.get(5)).toBe(5);
  });
});
