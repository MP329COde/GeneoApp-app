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
const search = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock('./api/geneoapp-client.js', () => ({
  createGeneoAppClient: () => ({ persons, graph, search }),
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

  it('recherche via le client API et affiche les résultats réels (aucune donnée fictive)', async () => {
    persons.list.mockResolvedValue([{ id: 1, given_names: 'Jean', family_name: 'Dupont' }]);
    graph.relations.mockResolvedValue({
      person: { id: 1 },
      parents: [],
      children: [],
      siblings: [],
      spouses: [],
    });
    search.query.mockResolvedValue([
      { entity_type: 'SOURCE', entity_id: 3, title: 'Registre paroissial de Sainte-Anne 1815' },
    ]);

    renderWithProviders(<App />);
    await waitFor(() => expect(screen.getByText('1 personne(s)')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Recherche' }));
    fireEvent.change(screen.getByLabelText('Rechercher'), { target: { value: 'paroissial' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }));

    await waitFor(() => expect(search.query).toHaveBeenCalledWith('paroissial'));
    await waitFor(() =>
      expect(screen.getByText(/Registre paroissial de Sainte-Anne 1815/)).toBeInTheDocument(),
    );
  });
});
