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
  }, 60000);
});

describe('raccourcis clavier documentés', () => {
  it('Ctrl+3 ouvre les familles et Ctrl+4 la recherche ; Ctrl+K place le focus sur la recherche rapide', async () => {
    const { container } = renderWithProviders(<App />);
    await waitFor(() => expect(screen.getByText('1 personne')).toBeInTheDocument());
    const current = () => container.querySelector('.sidenav__item[aria-current="page"]');

    fireEvent.keyDown(window, { key: '3', ctrlKey: true });
    await waitFor(() => expect(current()).toHaveTextContent('Familles'));
    fireEvent.keyDown(window, { key: '4', metaKey: true });
    await waitFor(() => expect(current()).toHaveTextContent('Recherche'));
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(document.activeElement?.tagName).toBe('INPUT');
  });
});
