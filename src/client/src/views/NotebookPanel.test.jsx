import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, screen } from '../test/test-utils.jsx';
import { NotebookPanel } from './NotebookPanel.jsx';

const research = {
  list: vi.fn(),
  get: vi.fn(),
  history: vi.fn(),
};
const client = { research };

beforeEach(() => {
  vi.clearAllMocks();
  research.list.mockResolvedValue([
    { id: 5, title: 'Acte de mariage', status: 'TODO', priority: 'MEDIUM', content: 'Piste' },
  ]);
  research.get.mockResolvedValue({
    id: 5,
    title: 'Acte de mariage',
    content: 'Piste',
    status: 'TODO',
    priority: 'MEDIUM',
    hypotheses: [],
    tasks: [],
    documents: [
      { id: 1, original_filename: 'registre.pdf', external_url: null },
      { id: 2, external_url: 'https://archives.example/acte', description: 'Archives en ligne' },
    ],
  });
  research.history.mockResolvedValue([
    { id: 11, table: 'research_notebook', rowId: 5, operation: 'UPDATE', at: '2026-01-02' },
  ]);
});

describe('NotebookPanel : détail d’une recherche', () => {
  it('affiche les documents liés et charge l’historique à la demande', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NotebookPanel client={client} persons={[]} onNavigate={() => {}} />);
    await user.click(await screen.findByRole('button', { name: 'Acte de mariage' }));
    expect(await screen.findByText('registre.pdf')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Archives en ligne' });
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(research.history).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /Afficher l’historique/ }));
    expect(research.history).toHaveBeenCalledWith(5);
    expect(await screen.findByText(/research_notebook #5/)).toBeInTheDocument();
  });
});
