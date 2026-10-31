import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { renderWithProviders, screen, within } from '../test/test-utils.jsx';
import { StatisticsView } from './StatisticsView.jsx';

const mocks = vi.hoisted(() => ({ totals: vi.fn(), insights: vi.fn() }));

vi.mock('../api/app-client.js', () => ({
  client: {
    statistics: {
      totals: (...a) => mocks.totals(...a),
      insights: (...a) => mocks.insights(...a),
    },
  },
}));

const insights = {
  persons: { total: 4, living: 1, bySex: { M: 2, F: 1, U: 1 } },
  birthsByDecade: [
    { decade: 1810, count: 1 },
    { decade: 1820, count: 0 },
    { decade: 1830, count: 2 },
  ],
  birthsDated: 3,
  birthSpan: { from: 1810, to: 1839 },
  generations: { count: 3, perGeneration: [2, 1, 1] },
  topPlaces: [{ name: 'Nantes', count: 2 }],
  topSurnames: [{ name: 'Dupont', count: 3 }],
  topGivenNames: [{ name: 'Jean', count: 2 }],
  completeness: {
    birthDate: { have: 3, total: 4, percent: 75 },
    birthPlace: { have: 2, total: 4, percent: 50 },
    parents: { have: 2, total: 4, percent: 50 },
    sourced: { have: 1, total: 4, percent: 25 },
    score: 50,
  },
  evidence: { facts: 3, factsCited: 1, sources: 2, sourcesUsed: 1 },
};

beforeEach(() => {
  mocks.totals.mockResolvedValue({
    totals: { persons: 4, unions: 1, events: 6, places: 2, sources: 2, media: 0 },
  });
  mocks.insights.mockResolvedValue({ insights });
});

describe('StatisticsView', () => {
  it('affiche les chiffres clés et les graphiques avec leurs équivalents textuels', async () => {
    renderWithProviders(<StatisticsView onNavigate={vi.fn()} />);

    const kpis = await screen.findByTestId('stats-kpis');
    const persons = within(kpis).getByText('Personnes').closest('div');
    expect(within(persons).getByText('4')).toBeInTheDocument();
    expect(within(persons).getByText('1 présumée vivante')).toBeInTheDocument();
    expect(within(kpis).getByText('1810–1839')).toBeInTheDocument();

    const sex = screen.getByTestId('stats-sex');
    expect(within(sex).getByRole('img').getAttribute('aria-label')).toMatch(/Hommes 2 \(50\s?%\)/);
    expect(within(sex).getByRole('table', { name: 'Répartition par sexe' })).toBeInTheDocument();

    const decades = screen.getByTestId('stats-decades');
    expect(within(decades).getByRole('img').getAttribute('aria-label')).toContain('1830 : 2');
    expect(
      within(decades).getByRole('table', { name: 'Naissances par décennie' }),
    ).toBeInTheDocument();

    const completeness = screen.getByTestId('stats-completeness');
    expect(within(completeness).getByText('En bonne voie')).toBeInTheDocument();
    expect(within(completeness).getByText(/Prochain pas : citer une source/)).toBeInTheDocument();

    const evidence = screen.getByTestId('stats-evidence');
    expect(within(evidence).getByText('Faits appuyés par une source')).toBeInTheDocument();
    expect(within(screen.getByTestId('stats-places')).getAllByText('Nantes')).toHaveLength(2);
  });

  it('propose d’ouvrir les sources depuis la carte de preuves', async () => {
    const onNavigate = vi.fn();
    renderWithProviders(<StatisticsView onNavigate={onNavigate} />);
    const evidence = await screen.findByTestId('stats-evidence');
    await userEvent
      .setup()
      .click(within(evidence).getByRole('button', { name: 'Ouvrir les sources' }));
    expect(onNavigate).toHaveBeenCalledWith('sources');
  });

  it('explique quoi saisir quand un graphique n’a pas encore de données', async () => {
    mocks.insights.mockResolvedValue({
      insights: {
        ...insights,
        birthsByDecade: [],
        birthsDated: 0,
        birthSpan: null,
        generations: { count: 1, perGeneration: [4] },
        topPlaces: [],
        evidence: { facts: 0, factsCited: 0, sources: 0, sourcesUsed: 0 },
      },
    });
    renderWithProviders(<StatisticsView onNavigate={vi.fn()} />);
    expect(await screen.findByText(/Aucune naissance datée pour le moment/)).toBeInTheDocument();
    expect(screen.getByText(/Aucun lieu n’est encore rattaché/)).toBeInTheDocument();
    expect(screen.getByText(/Aucun fait enregistré/)).toBeInTheDocument();
    expect(
      screen.getByText(/toutes les personnes figurent à la même génération/),
    ).toBeInTheDocument();
  });

  it('invite à ouvrir l’arbre quand il est vide', async () => {
    mocks.totals.mockResolvedValue({ totals: { persons: 0 } });
    const onNavigate = vi.fn();
    renderWithProviders(<StatisticsView onNavigate={onNavigate} />);
    expect(await screen.findByTestId('stats-empty')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Ouvrir l’arbre' }));
    expect(onNavigate).toHaveBeenCalledWith('tree');
  });

  it('reste utile si seuls les totaux sont disponibles', async () => {
    mocks.insights.mockRejectedValue(new Error('indisponible'));
    renderWithProviders(<StatisticsView onNavigate={vi.fn()} />);
    expect(await screen.findByTestId('stats-kpis')).toBeInTheDocument();
    expect(screen.queryByTestId('stats-charts')).toBeNull();
  });

  it('affiche une erreur compréhensible si les totaux sont illisibles', async () => {
    mocks.totals.mockRejectedValue(new Error('panne'));
    renderWithProviders(<StatisticsView onNavigate={vi.fn()} />);
    expect(await screen.findByText(/Impossible de charger les statistiques/)).toBeInTheDocument();
  });

  it('est accessible (axe), avec données comme à vide', async () => {
    const { container } = renderWithProviders(<StatisticsView onNavigate={vi.fn()} />);
    await screen.findByTestId('stats-charts');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('est accessible (axe) pour l’arbre vide', async () => {
    mocks.totals.mockResolvedValue({ totals: { persons: 0 } });
    const { container } = renderWithProviders(<StatisticsView onNavigate={vi.fn()} />);
    await screen.findByTestId('stats-empty');
    expect(await axe(container)).toHaveNoViolations();
  });
});
