import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { renderWithProviders } from './test/test-utils.jsx';

const persons = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
}));
const graph = vi.hoisted(() => ({
  relations: vi.fn(),
}));

vi.mock('./api/geneoapp-client.js', () => ({
  createGeneoAppClient: () => ({ persons, graph }),
}));

const { default: App } = await import('./App.jsx');

describe('App', () => {
  it('affiche un état vide sans donnée fictive quand aucune personne n’existe', async () => {
    persons.list.mockResolvedValue([]);

    renderWithProviders(<App />);

    await waitFor(() =>
      expect(screen.getByText(/Aucune personne enregistrée/)).toBeInTheDocument(),
    );
  });

  it('charge les personnes et leurs relations réelles depuis le client API', async () => {
    persons.list.mockResolvedValue([
      { id: 1, given_names: 'Jean', family_name: 'Dupont' },
      { id: 2, given_names: 'Louis', family_name: 'Dupont' },
    ]);
    graph.relations.mockResolvedValue({
      person: { id: 1 },
      parents: [{ id: 2, given_names: 'Louis', family_name: 'Dupont' }],
      children: [],
      siblings: [],
      spouses: [],
    });

    renderWithProviders(<App />);

    await waitFor(() => expect(screen.getByText('2 personne(s)')).toBeInTheDocument());
    await waitFor(() => expect(graph.relations).toHaveBeenCalledWith(1));
    await waitFor(() => expect(screen.getAllByText('Jean Dupont').length).toBeGreaterThan(0));
  });

  it('crée une personne via le client API (aucune logique métier locale)', async () => {
    persons.list
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 5, given_names: 'Ada', family_name: 'Lovelace' }]);
    persons.create.mockResolvedValue({ id: 5, given_names: 'Ada', family_name: 'Lovelace' });
    graph.relations.mockResolvedValue({
      person: { id: 5 },
      parents: [],
      children: [],
      siblings: [],
      spouses: [],
    });

    renderWithProviders(<App />);
    await waitFor(() =>
      expect(screen.getByText(/Aucune personne enregistrée/)).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByLabelText('Prénom(s)'), { target: { value: 'Ada' } });
    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Lovelace' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une personne' }));

    await waitFor(() =>
      expect(persons.create).toHaveBeenCalledWith({ givenNames: 'Ada', familyName: 'Lovelace' }),
    );
  });
});
