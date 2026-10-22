import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { renderWithProviders, screen, within } from '../test/test-utils.jsx';
import { DashboardView } from './DashboardView.jsx';

const mocks = vi.hoisted(() => ({
  totals: vi.fn(),
  active: vi.fn(),
  consistency: vi.fn(),
  duplicates: vi.fn(),
  conflicts: vi.fn(),
  notebook: vi.fn(),
}));

vi.mock('../api/app-client.js', () => ({
  client: {
    statistics: { totals: (...a) => mocks.totals(...a) },
    trees: { active: (...a) => mocks.active(...a) },
    graph: { consistency: (...a) => mocks.consistency(...a) },
    search: { duplicates: (...a) => mocks.duplicates(...a) },
    assertions: { conflicts: (...a) => mocks.conflicts(...a) },
    research: { list: (...a) => mocks.notebook(...a) },
  },
}));

beforeEach(() => {
  mocks.totals.mockResolvedValue({
    totals: { persons: 12, unions: 4, events: 30, places: 6, sources: 3, media: 2 },
  });
  mocks.active.mockResolvedValue({ id: 'main', name: 'Famille Martin' });
  mocks.consistency.mockResolvedValue({ counts: { certain: 2, unusual: 5 } });
  mocks.duplicates.mockResolvedValue({ items: [], total: 3 });
  mocks.conflicts.mockResolvedValue([{ field: 'birth_date' }]);
  mocks.notebook.mockResolvedValue([
    { id: 1, status: 'IN_PROGRESS', task_count: 4, done_task_count: 1 },
    { id: 2, status: 'TODO', task_count: 2, done_task_count: 0 },
    { id: 3, status: 'DONE', task_count: 5, done_task_count: 5 },
  ]);
});

describe('DashboardView', () => {
  it('résume l’arbre et ce qui demande attention, chaque carte menant à son écran', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderWithProviders(<DashboardView onNavigate={onNavigate} />);

    expect(
      await screen.findByRole('heading', { name: 'Tableau de bord — Famille Martin' }),
    ).toBeInTheDocument();
    const persons = screen.getByText('Personnes').closest('div');
    expect(within(persons).getByText('12')).toBeInTheDocument();

    const certain = screen.getByTestId('dashboard-certain');
    expect(within(certain).getByText('2')).toBeInTheDocument();
    await user.click(within(certain).getByRole('button', { name: 'Ouvrir' }));
    expect(onNavigate).toHaveBeenCalledWith('consistency');

    await user.click(within(screen.getByTestId('dashboard-duplicates')).getByRole('button'));
    expect(onNavigate).toHaveBeenCalledWith('duplicates');
    await user.click(within(screen.getByTestId('dashboard-conflicts')).getByRole('button'));
    expect(onNavigate).toHaveBeenCalledWith('annotations');

    const research = screen.getByTestId('dashboard-research');
    expect(within(research).getByText('2')).toBeInTheDocument();
    expect(within(research).getByText(/5 tâche\(s\) à faire/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Importer / exporter' }));
    expect(onNavigate).toHaveBeenCalledWith('gedcom');
  });

  it('signale clairement qu’il n’y a rien à surveiller', async () => {
    mocks.consistency.mockResolvedValue({ counts: { certain: 0, unusual: 0 } });
    mocks.duplicates.mockResolvedValue({ items: [], total: 0 });
    mocks.conflicts.mockResolvedValue([]);
    mocks.notebook.mockResolvedValue([]);
    renderWithProviders(<DashboardView onNavigate={vi.fn()} />);
    expect(await screen.findByText(/Rien à signaler/)).toBeInTheDocument();
    expect(within(screen.getByTestId('dashboard-certain')).queryByRole('button')).toBeNull();
  });

  it('un indicateur indisponible n’empêche pas d’afficher les autres', async () => {
    mocks.consistency.mockRejectedValue(new Error('panne'));
    mocks.conflicts.mockRejectedValue(new Error('panne'));
    renderWithProviders(<DashboardView onNavigate={vi.fn()} />);
    expect(await screen.findByTestId('dashboard-duplicates')).toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-certain')).toBeNull();
    expect(screen.queryByTestId('dashboard-conflicts')).toBeNull();
  });

  it('affiche une erreur si le contenu de l’arbre est illisible', async () => {
    mocks.totals.mockRejectedValue(new Error('Base illisible'));
    renderWithProviders(<DashboardView onNavigate={vi.fn()} />);
    expect(await screen.findByText('Base illisible')).toBeInTheDocument();
  });

  it('est accessible (axe)', async () => {
    const { container } = renderWithProviders(<DashboardView onNavigate={vi.fn()} />);
    await screen.findByTestId('dashboard-certain');
    expect(await axe(container)).toHaveNoViolations();
  });
});
