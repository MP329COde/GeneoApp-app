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
const gedcom = vi.hoisted(() => ({
  preview: vi.fn(),
  import: vi.fn(),
  export: vi.fn(),
}));
const accounts = vi.hoisted(() => ({
  create: vi.fn(),
  login: vi.fn(),
}));
const backups = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
}));
const trash = vi.hoisted(() => ({
  list: vi.fn(),
}));

vi.mock('./api/geneoapp-client.js', () => ({
  createGeneoAppClient: () => ({ persons, graph, search, gedcom, accounts, backups, trash }),
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

  it('affiche l’aperçu GEDCOM et bloque l’import tant qu’il est invalide (pas de rollback silencieux)', async () => {
    persons.list.mockResolvedValue([]);
    gedcom.preview.mockResolvedValue({
      valid: false,
      errors: [{ message: 'Version GEDCOM non supportée' }],
      mapping: { persons: 0, unions: 0, events: 0 },
    });

    renderWithProviders(<App />);
    await waitFor(() =>
      expect(screen.getByText(/Aucune personne enregistrée/)).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'GEDCOM' }));
    fireEvent.change(screen.getByLabelText('Contenu GEDCOM'), {
      target: { value: '0 HEAD\n0 TRLR' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Aperçu' }));

    await waitFor(() => expect(screen.getByText(/GEDCOM invalide/)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Importer' })).toBeDisabled();
    expect(gedcom.import).not.toHaveBeenCalled();
  });

  it('importe un GEDCOM valide via le client API puis recharge les personnes réelles', async () => {
    persons.list
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 9, given_names: 'Ada', family_name: 'Lovelace' }]);
    gedcom.preview.mockResolvedValue({
      valid: true,
      mapping: { persons: 1, unions: 0, events: 0 },
    });
    gedcom.import.mockResolvedValue({ imported: true, ids: { persons: [9] } });

    renderWithProviders(<App />);
    await waitFor(() =>
      expect(screen.getByText(/Aucune personne enregistrée/)).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'GEDCOM' }));
    fireEvent.change(screen.getByLabelText('Contenu GEDCOM'), {
      target: { value: '0 HEAD\n0 @I1@ INDI\n0 TRLR' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Aperçu' }));
    await waitFor(() => expect(screen.getByText(/Aperçu valide/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Importer' }));

    await waitFor(() => expect(gedcom.import).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText(/Import réussi/)).toBeInTheDocument());
    await waitFor(() => expect(persons.list).toHaveBeenCalledTimes(2));
  });

  it('exporte un GEDCOM réel via le client API (déclenche un téléchargement)', async () => {
    persons.list.mockResolvedValue([]);
    gedcom.export.mockResolvedValue({ format: '7', gedcom: '0 HEAD\n0 TRLR\n' });
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:mock'), revokeObjectURL: vi.fn() });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    renderWithProviders(<App />);
    await waitFor(() =>
      expect(screen.getByText(/Aucune personne enregistrée/)).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'GEDCOM' }));
    fireEvent.click(screen.getByRole('button', { name: 'Exporter l’arbre complet' }));

    await waitFor(() => expect(gedcom.export).toHaveBeenCalledWith({ format: '7' }));
    expect(clickSpy).toHaveBeenCalled();

    clickSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it('exige une connexion avant d’accéder aux sauvegardes et à la corbeille', async () => {
    persons.list.mockResolvedValue([]);
    accounts.login.mockResolvedValue({ token: 'tok-1', account: { id: 1, name: 'Alice' } });
    backups.list.mockResolvedValue([{ filename: 'backup-1.json' }]);
    trash.list.mockResolvedValue([{ table: 'persons', id: 3, label: 'Jean Dupont' }]);

    renderWithProviders(<App />);
    await waitFor(() =>
      expect(screen.getByText(/Aucune personne enregistrée/)).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sauvegardes' }));
    expect(screen.getByText(/connectez-vous avec un profil local/)).toBeInTheDocument();
    expect(backups.list).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Profil local'), { target: { value: 'Alice' } });
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));

    await waitFor(() => expect(accounts.login).toHaveBeenCalledWith('Alice', undefined));
    await waitFor(() => expect(screen.getByText('backup-1.json')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText(/Jean Dupont/)).toBeInTheDocument());
  });

  it('crée un profil à la volée si la connexion échoue en 401 (premier lancement)', async () => {
    persons.list.mockResolvedValue([]);
    const unauthorized = Object.assign(new Error('Nom de profil ou code inconnu'), {
      status: 401,
    });
    accounts.login.mockRejectedValueOnce(unauthorized).mockResolvedValueOnce({
      token: 'tok-2',
      account: { id: 2, name: 'Bob' },
    });
    accounts.create.mockResolvedValue({ id: 2, name: 'Bob' });
    backups.list.mockResolvedValue([]);
    trash.list.mockResolvedValue([]);

    renderWithProviders(<App />);
    await waitFor(() =>
      expect(screen.getByText(/Aucune personne enregistrée/)).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sauvegardes' }));
    fireEvent.change(screen.getByLabelText('Profil local'), { target: { value: 'Bob' } });
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));

    await waitFor(() =>
      expect(accounts.create).toHaveBeenCalledWith({ name: 'Bob', pin: undefined }),
    );
    await waitFor(() => expect(accounts.login).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText(/Aucune sauvegarde/)).toBeInTheDocument());
  });
});
