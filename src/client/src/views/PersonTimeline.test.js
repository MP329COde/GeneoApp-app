import { describe, expect, it } from 'vitest';
import { buildPersonTimeline } from './PersonTimeline.jsx';

const event = (id, type, dateText, personId, extra = {}) => ({
  id,
  type,
  date_text: dateText,
  place_name: extra.place ?? null,
  participants: [
    {
      personId,
      role: 'PRINCIPAL',
      personGivenNames: extra.given ?? 'X',
      personFamilyName: extra.family ?? 'Y',
    },
  ],
});

describe('buildPersonTimeline', () => {
  it('mêle vie propre et famille proche, triées, avec l’âge', () => {
    const person = { id: 1, given_names: 'Jean', family_name: 'Dupont' };
    const relations = {
      parents: [{ id: 2 }],
      siblings: [{ id: 3 }],
      spouses: [],
      children: [{ id: 4 }],
    };
    const rows = buildPersonTimeline(person, relations, [
      event(10, 'DEATH', '1870', 1),
      event(11, 'BIRTH', '12 mars 1800', 1, { place: 'Rouen' }),
      event(12, 'DEATH', '1830', 2, { given: 'Pierre', family: 'Dupont' }),
      event(13, 'BIRTH', '1802', 3, { given: 'Marie', family: 'Dupont' }),
      event(14, 'BIRTH', '1825', 4, { given: 'Paul', family: 'Dupont' }),
      event(15, 'BIRTH', '1700', 99),
      event(16, 'BIRTH', '1831', 2),
    ]);
    expect(rows.map((row) => [row.type, row.relation, row.age])).toEqual([
      ['BIRTH', null, null],
      ['BIRTH', 'fratrie', 2],
      ['BIRTH', 'enfant', 25],
      ['DEATH', 'parent', 30],
      ['DEATH', null, 70],
    ]);
    expect(rows[0].place).toBe('Rouen');
    expect(rows[3].relativeName).toBe('Pierre Dupont');
    expect(rows[1].approximateAge).toBe(true);
  });
});
