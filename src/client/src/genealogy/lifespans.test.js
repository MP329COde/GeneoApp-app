import { describe, expect, it } from 'vitest';
import { buildLifespans, shortYear } from './lifespans.js';
import { parseGenealogyDate } from '../../../db/src/dates/genealogy-date.js';

const event = (type, dateText, personId, role = 'PRINCIPAL') => ({
  type,
  date_text: dateText,
  participants: [{ personId, role }],
});

describe('buildLifespans', () => {
  it('compose « naissance – décès » avec les approximations', () => {
    const lifespans = buildLifespans([
      event('BIRTH', 'vers 1760', 1),
      event('DEATH', '12 NOV 1822', 1),
      event('BAPTISM', '4 mars 1788', 2),
      event('BURIAL', 'avant 1851', 3),
      event('BIRTH', '1700', 4, 'WITNESS'),
    ]);
    expect(lifespans.get(1).label).toBe('vers 1760 – 1822');
    expect(lifespans.get(2).label).toBe('° 1788');
    expect(lifespans.get(3).label).toBe('† av. 1851');
    expect(lifespans.has(4)).toBe(false);
    expect(lifespans.get(1).birthYear).toBe(1760);
  });

  it('formate les intervalles et le doute', () => {
    expect(shortYear(parseGenealogyDate('entre 1820 et 1825'))).toBe('1820/1825');
    expect(shortYear(parseGenealogyDate('1812 ?'))).toBe('1812 ?');
    expect(shortYear(parseGenealogyDate('n’importe quoi'))).toBeNull();
  });
});
