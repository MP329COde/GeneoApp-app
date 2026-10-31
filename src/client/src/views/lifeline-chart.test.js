import { describe, expect, it } from 'vitest';
import {
  MIN_SPAN_YEARS,
  OPEN_SPAN_YEARS,
  buildLifelines,
  buildTicks,
  categoryOf,
  clampView,
  dateSpan,
  extentOf,
  neighbourMarker,
  panView,
  tickStep,
  xOf,
  zoomView,
} from './lifeline-chart.js';

const who = (id, given, family) => ({
  personId: id,
  role: 'PRINCIPAL',
  personGivenNames: given,
  personFamilyName: family,
});
const event = (id, type, date_text, participants) => ({ id, type, date_text, participants });

describe('dateSpan', () => {
  it('une date exacte est un point', () => {
    const span = dateSpan('12 mars 1812');
    expect(span.imprecise).toBe(false);
    expect(span.from).toBe(span.to);
    expect(Math.floor(span.at)).toBe(1812);
  });

  it('vers / entre donnent une plage autour de la position', () => {
    const about = dateSpan('vers 1812');
    expect(about.imprecise).toBe(true);
    expect(about.from).toBeLessThan(1812);
    expect(about.to).toBeGreaterThan(1813);
    const between = dateSpan('entre 1820 et 1830');
    expect(Math.floor(between.from)).toBe(1820);
    expect(Math.floor(between.to)).toBe(1830);
    expect(between.at).toBeGreaterThan(between.from);
  });

  it('avant / après ont une borne ouverte', () => {
    const before = dateSpan('avant 1850');
    expect(before.open).toBe('before');
    expect(before.to - before.from).toBeCloseTo(OPEN_SPAN_YEARS + (before.to - before.to), 5);
    expect(dateSpan('après 1850').open).toBe('after');
  });

  it('une date vide ou incomprise est ignorée', () => {
    expect(dateSpan('')).toBeNull();
    expect(dateSpan(null)).toBeNull();
    expect(dateSpan('n’importe quoi')).toBeNull();
  });
});

describe('categoryOf', () => {
  it('range les types en catégories', () => {
    expect(categoryOf('BIRTH')).toBe('birth');
    expect(categoryOf('DEATH')).toBe('death');
    expect(categoryOf('MARRIAGE')).toBe('marriage');
    expect(categoryOf('OCCUPATION')).toBe('other');
  });
});

describe('buildLifelines', () => {
  const ada = who(1, 'Ada', 'Lovelace');
  const charles = who(2, 'Charles', 'Babbage');
  const events = [
    event(1, 'BIRTH', '10 décembre 1815', [ada]),
    event(2, 'DEATH', '27 novembre 1852', [ada]),
    event(3, 'MARRIAGE', 'vers 1835', [ada, charles]),
    event(4, 'BIRTH', '1791', [charles]),
    event(5, 'OCCUPATION', '', [charles]),
  ];

  it('construit une ligne par personne, du plus ancien au plus récent', () => {
    const rows = buildLifelines([], events, { now: 2026 });
    expect(rows.map((row) => row.name)).toEqual(['Charles Babbage', 'Ada Lovelace']);
    const lovelace = rows[1];
    expect(lovelace.endKind).toBe('death');
    expect(lovelace.markers.map((m) => m.category)).toEqual(['birth', 'marriage', 'death']);
  });

  it('une personne vivante a une ligne ouverte jusqu’à maintenant, sans décès inventé', () => {
    const rows = buildLifelines([{ id: 2, is_living: 1 }], events, { now: 2026.5 });
    const babbage = rows.find((row) => row.personId === 2);
    expect(babbage.endKind).toBe('living');
    expect(babbage.end).toBe(2026.5);
    expect(babbage.markers.some((m) => m.category === 'death')).toBe(false);
  });

  it('une personne non vivante sans décès s’arrête à son dernier événement', () => {
    const rows = buildLifelines([{ id: 2, is_living: 0 }], events, { now: 2026 });
    const babbage = rows.find((row) => row.personId === 2);
    expect(babbage.endKind).toBe('unknown');
    expect(babbage.end).toBeLessThan(1840);
  });

  it('ignore les personnes sans événement daté', () => {
    expect(buildLifelines([], [event(9, 'BIRTH', '', [ada])])).toEqual([]);
  });

  it('sans naissance, le début n’est pas connu', () => {
    const rows = buildLifelines([], [event(1, 'DEATH', '1900', [ada])]);
    expect(rows[0].startKnown).toBe(false);
  });
});

describe('graduations et échelle', () => {
  it('le pas s’adapte à la durée affichée', () => {
    expect(tickStep(10)).toBe(1);
    expect(tickStep(100)).toBe(10);
    expect(tickStep(300)).toBe(50);
    expect(tickStep(5000)).toBe(500);
    expect(tickStep(50000)).toBe(1000);
  });

  it('les graduations tombent sur des multiples du pas et restent dans la fenêtre', () => {
    const ticks = buildTicks({ start: 1803, end: 1897 });
    expect(ticks.length).toBeGreaterThan(3);
    expect(ticks.length).toBeLessThanOrEqual(11);
    for (const tick of ticks) {
      expect(tick.value % 10).toBe(0);
      expect(tick.value).toBeGreaterThanOrEqual(1803);
      expect(tick.value).toBeLessThanOrEqual(1897);
    }
    expect(buildTicks({ start: 1800, end: 1810 }).length).toBeGreaterThan(
      buildTicks({ start: 1800, end: 1900 }).length - 1,
    );
  });

  it('xOf projette linéairement dans la zone de tracé', () => {
    const plot = { left: 100, width: 800 };
    const view = { start: 1800, end: 1900 };
    expect(xOf(view, plot, 1800)).toBe(100);
    expect(xOf(view, plot, 1900)).toBe(900);
    expect(xOf(view, plot, 1850)).toBe(500);
  });

  it('extentOf ajoute une marge et renvoie null sans ligne', () => {
    expect(extentOf([])).toBeNull();
    const extent = extentOf([{ from: 1800.2, to: 1850.4 }]);
    expect(extent.start).toBeLessThan(1800);
    expect(extent.end).toBeGreaterThan(1850);
  });
});

describe('zoom et déplacement', () => {
  const extent = { start: 1700, end: 1900 };

  it('le zoom garde fixe l’année ancre', () => {
    const view = zoomView(extent, extent, 2, 1750);
    expect(view.end - view.start).toBe(100);
    expect((1750 - view.start) / (view.end - view.start)).toBeCloseTo(0.25, 5);
  });

  it('le zoom est borné par la durée minimale et l’étendue', () => {
    let view = extent;
    for (let i = 0; i < 40; i += 1) view = zoomView(view, extent, 2, 1800);
    expect(view.end - view.start).toBeCloseTo(MIN_SPAN_YEARS, 5);
    expect(zoomView(extent, extent, 0.1, 1800)).toEqual(extent);
  });

  it('le déplacement reste dans l’étendue', () => {
    const view = { start: 1750, end: 1800 };
    expect(panView(view, extent, 20)).toEqual({ start: 1770, end: 1820 });
    expect(panView(view, extent, -500)).toEqual({ start: 1700, end: 1750 });
    expect(panView(view, extent, 500)).toEqual({ start: 1850, end: 1900 });
    expect(clampView({ start: 1600, end: 2000 }, extent)).toEqual(extent);
  });
});

describe('neighbourMarker', () => {
  const rows = [
    {
      markers: [
        { key: 'a1', at: 1800 },
        { key: 'a2', at: 1850 },
      ],
    },
    {
      markers: [
        { key: 'b1', at: 1790 },
        { key: 'b2', at: 1845 },
      ],
    },
  ];
  it('gauche / droite suivent la ligne', () => {
    expect(neighbourMarker(rows, 'a1', 'ArrowRight')).toBe('a2');
    expect(neighbourMarker(rows, 'a2', 'ArrowRight')).toBe('a2');
    expect(neighbourMarker(rows, 'a2', 'ArrowLeft')).toBe('a1');
  });
  it('haut / bas vont au marqueur le plus proche de la ligne voisine', () => {
    expect(neighbourMarker(rows, 'a2', 'ArrowDown')).toBe('b2');
    expect(neighbourMarker(rows, 'b1', 'ArrowUp')).toBe('a1');
    expect(neighbourMarker(rows, 'a1', 'ArrowUp')).toBe('a1');
  });
});
