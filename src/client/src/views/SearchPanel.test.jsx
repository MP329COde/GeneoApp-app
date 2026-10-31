import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, screen, within } from '../test/test-utils.jsx';

const query = vi.fn();

vi.mock('../api/app-client.js', () => ({
  client: {
    search: { query: (...args) => query(...args) },
    advancedSearch: vi.fn(),
    indexing: { connectors: vi.fn().mockResolvedValue([]) },
  },
}));

const { SearchPanel } = await import('./SearchPanel.jsx');

const persons = [
  { id: 1, given_names: 'Hélène', family_name: 'Dupont' },
  { id: 2, given_names: 'Jean', family_name: 'Martin' },
];
const lifespans = new Map([[1, { label: '1850 – 1920', birthPlace: 'Rouen' }]]);

function setup(props = {}) {
  const onNavigate = vi.fn();
  const onOpenView = vi.fn();
  renderWithProviders(
    <SearchPanel
      persons={persons}
      lifespans={lifespans}
      onNavigate={onNavigate}
      onOpenView={onOpenView}
      {...props}
    />,
  );
  return { onNavigate, onOpenView };
}

describe('SearchPanel', () => {
  beforeEach(() => {
    query.mockReset();
    window.localStorage.clear();
  });

  it('propose des pistes quand rien n’a encore été cherché', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Que cherchez-vous ?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dupont' })).toBeInTheDocument();
  });

  it('groupe les résultats par type avec compteurs, dates et terme surligné', async () => {
    query.mockResolvedValue([
      { entity_type: 'PERSON', entity_id: 1, title: 'Hélène Dupont', excerpt: 'Née à Rouen' },
      { entity_type: 'SOURCE', entity_id: 7, title: 'Registre de Dupont', excerpt: '' },
    ]);
    const { onNavigate, onOpenView } = setup();
    const user = userEvent.setup();
    await user.type(screen.getByRole('combobox', { name: 'Rechercher' }), 'dupont{Enter}');

    const people = await screen.findByRole('region', { name: /Personnes/ });
    expect(within(people).getByText('1850 – 1920')).toBeInTheDocument();
    expect(within(people).getByText('Dupont', { selector: 'mark' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sources 1/ })).toBeInTheDocument();

    await user.click(within(people).getByRole('button', { name: /Hélène Dupont/ }));
    expect(onNavigate).toHaveBeenCalledWith(1);
    await user.click(screen.getByRole('button', { name: /Registre de Dupont/ }));
    expect(onOpenView).toHaveBeenCalledWith('sources');
  });

  it('se parcourt aux flèches du clavier depuis la barre', async () => {
    query.mockResolvedValue([
      { entity_type: 'PERSON', entity_id: 1, title: 'Hélène Dupont', excerpt: '' },
      { entity_type: 'PERSON', entity_id: 2, title: 'Jean Martin', excerpt: '' },
    ]);
    setup();
    const user = userEvent.setup();
    const box = screen.getByRole('combobox', { name: 'Rechercher' });
    await user.type(box, 'ma{Enter}');
    await screen.findByRole('button', { name: /Jean Martin/ });
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', { name: /Hélène Dupont/ })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', { name: /Jean Martin/ })).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('button', { name: /Hélène Dupont/ })).toHaveFocus();
  });

  it('suggère une orthographe proche quand rien ne correspond', async () => {
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { entity_type: 'PERSON', entity_id: 1, title: 'Hélène Dupont', excerpt: '' },
      ]);
    setup();
    const user = userEvent.setup();
    await user.type(screen.getByRole('combobox', { name: 'Rechercher' }), 'Dupond{Enter}');

    expect(await screen.findByText('Aucun résultat pour « Dupond ».')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Dupont' }));
    expect(query).toHaveBeenLastCalledWith('Dupont');
    expect(await screen.findByRole('button', { name: /Hélène Dupont/ })).toBeInTheDocument();
  });
});
