import { describe, expect, it, vi } from 'vitest';
import { axe } from 'jest-axe';
import { act, screen, waitFor, fireEvent } from '@testing-library/react';
import { renderWithProviders } from './test/test-utils.jsx';

// Client factice générique : chaque méthode répond par une liste vide, sauf
// celles dont l'écran attend un objet ou des données précises. Le but est de
// parcourir TOUTES les vues de la navigation et de les passer à axe.
const overrides = vi.hoisted(() => ({
  'persons.list': [{ id: 1, given_names: 'Jean', family_name: 'Dupont', sex: 'M' }],
  'graph.relations': { person: { id: 1 }, parents: [], children: [], siblings: [], spouses: [] },
  'graph.timeline': [],
  'graph.consistency': { certain: [], unusual: [], counts: { certain: 0, unusual: 0 } },
  'statistics.totals': {
    totals: { persons: 1, events: 0, sources: 0, places: 0, unions: 0, media: 0 },
  },
  'statistics.insights': {
    insights: {
      persons: { total: 1, living: 1, bySex: { M: 1, F: 0, U: 0 } },
      birthsByDecade: [],
      birthsDated: 0,
      birthSpan: null,
      generations: { count: 1, perGeneration: [1] },
      topPlaces: [],
      topSurnames: [{ name: 'Dupont', count: 1 }],
      topGivenNames: [{ name: 'Jean', count: 1 }],
      completeness: {
        birthDate: { have: 0, total: 1, percent: 0 },
        birthPlace: { have: 0, total: 1, percent: 0 },
        parents: { have: 0, total: 1, percent: 0 },
        sourced: { have: 0, total: 1, percent: 0 },
        score: 0,
      },
      evidence: { facts: 0, factsCited: 0, sources: 0, sourcesUsed: 0 },
    },
  },
  'indexing.status': {
    running: false,
    settings: { networkAllowed: true, scheduleEnabled: false, scheduleHour: 3 },
    sources: [],
    runs: [],
    progress: null,
    stats: { documents: 0, byStatus: {} },
    presets: [],
  },
  'indexing.searchPage': { hits: [], total: 0 },
  'ai.status': {
    state: 'DISABLED',
    enabled: false,
    provider: 'OLLAMA',
    endpoint: 'http://127.0.0.1:11434',
    model: '',
    models: [],
    prompts: [],
  },
  'history.status': { canUndo: false, canRedo: false },
  'notifications.list': { items: [], unread: 0 },
  'trees.active': { id: 'default', name: 'Mon arbre', active: true },
}));

vi.mock('./api/geneoapp-client.js', () => {
  const method = (path) => async () => (path in overrides ? overrides[path] : []);
  const domain = (name) =>
    new Proxy(
      {},
      {
        get: (cache, key) => {
          if (typeof key !== 'string' || key === 'then') return undefined;
          cache[key] ??= method(`${name}.${key}`);
          return cache[key];
        },
      },
    );
  const domains = [
    'accounts',
    'assertions',
    'ai',
    'audit',
    'backups',
    'events',
    'gedcom',
    'graph',
    'history',
    'indexing',
    'media',
    'notes',
    'notifications',
    'parentages',
    'persons',
    'places',
    'research',
    'search',
    'sources',
    'statistics',
    'storage',
    'trash',
    'trees',
    'unions',
  ];
  return {
    createGeneoAppClient: () => ({
      ...Object.fromEntries(domains.map((name) => [name, domain(name)])),
      advancedSearch: async () => ({ results: [], total: 0 }),
      quality: async () => ({
        totals: { facts: 0, sourced: 0 },
        issues: [],
        confidence: null,
        facts: [],
      }),
    }),
  };
});

const { default: App } = await import('./App.jsx');

describe('accessibilité de toutes les vues', () => {
  it("n'a aucune violation axe dans aucune des vues de la navigation", async () => {
    const { container } = renderWithProviders(<App />);
    await waitFor(() => expect(screen.getByText('1 personne')).toBeInTheDocument());
    const labels = [...container.querySelectorAll('.sidenav__item')].map((item) =>
      item.textContent.trim(),
    );
    expect(labels.length).toBeGreaterThanOrEqual(15);

    const violations = [];
    for (const label of labels) {
      const button = [...container.querySelectorAll('.sidenav__item')].find(
        (item) => item.textContent.trim() === label,
      );
      fireEvent.click(button);
      // Laisse les chargements de la vue se terminer avant l'analyse.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
      });
      const result = await axe(container);
      for (const violation of result.violations) {
        violations.push(`${label} : ${violation.id} (${violation.nodes.length})`);
      }
    }
    expect(violations).toEqual([]);
  }, 180000);
});

describe('raccourcis clavier documentés', () => {
  it('Ctrl+3 ouvre les familles et Ctrl+4 la recherche ; Ctrl+K place le focus sur la recherche rapide', async () => {
    const { container } = renderWithProviders(<App />);
    await waitFor(() => expect(screen.getByText('1 personne')).toBeInTheDocument(), {
      timeout: 5000,
    });
    const current = () => container.querySelector('.sidenav__item[aria-current="page"]');

    fireEvent.keyDown(window, { key: '3', ctrlKey: true });
    await waitFor(() => expect(current()).toHaveTextContent('Familles'), { timeout: 5000 });
    fireEvent.keyDown(window, { key: '4', metaKey: true });
    await waitFor(() => expect(current()).toHaveTextContent('Recherche'), { timeout: 5000 });
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(document.activeElement?.tagName).toBe('INPUT');
  });
});

describe('frise chronologique', () => {
  it('est accessible, bascule depuis la liste et sélectionne la personne au clic', async () => {
    overrides['events.listAll'] = [
      {
        id: 1,
        type: 'BIRTH',
        date_text: 'vers 1850',
        value: null,
        place_name: null,
        participants: [
          { personId: 1, role: 'PRINCIPAL', personGivenNames: 'Jean', personFamilyName: 'Dupont' },
        ],
      },
    ];
    try {
      const { container } = renderWithProviders(<App />);
      await waitFor(() => expect(screen.getByText('1 personne')).toBeInTheDocument());
      const nav = [...container.querySelectorAll('.sidenav__item')].find(
        (item) => item.textContent.trim() === 'Chronologie',
      );
      fireEvent.click(nav);
      fireEvent.click(await screen.findByRole('button', { name: 'Frise' }));
      const marker = await screen.findByRole('button', {
        name: /Naissance, Jean Dupont, vers 1850/,
      });
      expect(await axe(container)).toHaveNoViolations();
      fireEvent.click(marker);
      await waitFor(() => expect(marker).toHaveAttribute('aria-pressed', 'true'));
      fireEvent.click(screen.getByRole('button', { name: 'Liste' }));
      expect(screen.getByText(/BIRTH/)).toBeInTheDocument();
    } finally {
      delete overrides['events.listAll'];
    }
  }, 30000);
});
