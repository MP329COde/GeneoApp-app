import { describe, expect, it, vi } from 'vitest';
import { axe } from 'jest-axe';
import { screen, waitFor, fireEvent, within } from '@testing-library/react';
import { renderWithProviders } from './test/test-utils.jsx';

const persons = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}));
const graph = vi.hoisted(() => ({
  relations: vi.fn(),
  cycles: vi.fn(),
  timeline: vi.fn(),
  commonAncestors: vi.fn(),
}));
const search = vi.hoisted(() => ({
  query: vi.fn(),
  duplicates: vi.fn(),
  merge: vi.fn(),
  previewMerge: vi.fn(),
}));
const gedcom = vi.hoisted(() => ({
  preview: vi.fn(),
  import: vi.fn(),
  export: vi.fn(),
}));
const accounts = vi.hoisted(() => ({
  create: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  remove: vi.fn(),
}));
const backups = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
}));
const trash = vi.hoisted(() => ({
  list: vi.fn(),
}));
const unions = vi.hoisted(() => ({
  create: vi.fn(),
  listForPerson: vi.fn(),
  remove: vi.fn(),
}));
const research = vi.hoisted(() => ({
  create: vi.fn(),
  list: vi.fn(),
}));
const statistics = vi.hoisted(() => ({
  totals: vi.fn(),
}));
const ai = vi.hoisted(() => ({
  analyze: vi.fn(),
}));
const notes = vi.hoisted(() => ({
  create: vi.fn(),
  listForEntity: vi.fn(),
}));
const media = vi.hoisted(() => ({
  upload: vi.fn(),
  download: vi.fn(),
  listForEntity: vi.fn(),
  listForSource: vi.fn().mockResolvedValue([]),
  remove: vi.fn(),
}));
const sources = vi.hoisted(() => ({
  create: vi.fn(),
  get: vi.fn(),
  addCitation: vi.fn(),
  listCitationsForEntity: vi.fn(),
}));
const parentages = vi.hoisted(() => ({
  create: vi.fn(),
  listParentsOf: vi.fn().mockResolvedValue([]),
  listChildrenOf: vi.fn().mockResolvedValue([]),
  remove: vi.fn(),
}));
const places = vi.hoisted(() => ({
  create: vi.fn(),
  list: vi.fn().mockResolvedValue([]),
  get: vi.fn(),
  remove: vi.fn(),
}));
const events = vi.hoisted(() => ({
  create: vi.fn(),
  get: vi.fn(),
  listAll: vi.fn(),
  listForPerson: vi.fn(),
  addParticipant: vi.fn(),
  remove: vi.fn(),
}));
const audit = vi.hoisted(() => ({
  listForEntity: vi.fn(),
}));

vi.mock('./api/geneoapp-client.js', () => ({
  createGeneoAppClient: () => ({
    persons,
    graph,
    search,
    gedcom,
    accounts,
    backups,
    trash,
    unions,
    research,
    statistics,
    ai,
    notes,
    media,
    sources,
    parentages,
    places,
    events,
    audit,
  }),
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

  it("n'a aucune violation d'accessibilité détectée par axe (état vide)", async () => {
    persons.list.mockResolvedValue([]);

    const { container } = renderWithProviders(<App />);
    await waitFor(() =>
      expect(screen.getByText(/Aucune personne enregistrée/)).toBeInTheDocument(),
    );

    expect(await axe(container)).toHaveNoViolations();
  });

  it("n'a aucune violation d'accessibilité détectée par axe (arbre avec données réelles)", async () => {
    persons.list.mockResolvedValue([{ id: 1, given_names: 'Jean', family_name: 'Dupont' }]);
    graph.relations.mockResolvedValue({
      person: { id: 1 },
      parents: [],
      children: [],
      siblings: [],
      spouses: [],
    });

    const { container } = renderWithProviders(<App />);
    await waitFor(() => expect(screen.getByText('1 personne(s)')).toBeInTheDocument());
    await waitFor(() => expect(screen.getAllByText('Jean Dupont').length).toBeGreaterThan(0));

    expect(await axe(container)).toHaveNoViolations();
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

  it('navigue entre les personnes au clavier avec les flèches haut/bas', async () => {
    persons.list.mockResolvedValue([
      { id: 1, given_names: 'Jean', family_name: 'Dupont' },
      { id: 2, given_names: 'Louis', family_name: 'Dupont' },
    ]);
    graph.relations.mockResolvedValue({
      person: { id: 1 },
      parents: [],
      children: [],
      siblings: [],
      spouses: [],
    });

    renderWithProviders(<App />);
    await waitFor(() => expect(screen.getByText('2 personne(s)')).toBeInTheDocument());
    await waitFor(() => expect(graph.relations).toHaveBeenCalledWith(1));

    const nav = screen.getByRole('navigation', { name: 'Personnes' });
    fireEvent.keyDown(within(nav).getByRole('button', { name: 'Jean Dupont' }), {
      key: 'ArrowDown',
    });
    await waitFor(() => expect(graph.relations).toHaveBeenCalledWith(2));

    fireEvent.keyDown(within(nav).getByRole('button', { name: 'Louis Dupont' }), {
      key: 'ArrowUp',
    });
    await waitFor(() => expect(graph.relations).toHaveBeenCalledWith(1));
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

  it('modifie l’identité étendue d’une personne via le client API', async () => {
    persons.list.mockResolvedValue([
      { id: 1, given_names: 'Jean', family_name: 'Dupont', is_living: 1 },
    ]);
    graph.relations.mockResolvedValue({
      person: { id: 1 },
      parents: [],
      children: [],
      siblings: [],
      spouses: [],
    });
    persons.update.mockResolvedValue({});

    renderWithProviders(<App />);
    await waitFor(() => expect(screen.getByText('1 personne(s)')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Surnom / alias'), { target: { value: 'Jeannot' } });
    fireEvent.click(screen.getByLabelText('Personne vivante'));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() =>
      expect(persons.update).toHaveBeenCalledWith(1, {
        nickname: 'Jeannot',
        marriedName: null,
        title: null,
        suffix: null,
        isLiving: false,
      }),
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

  it('permet de se déconnecter et de supprimer réellement le profil local', async () => {
    persons.list.mockResolvedValue([]);
    accounts.login.mockResolvedValue({ token: 'tok-1', account: { id: 1, name: 'Alice' } });
    accounts.logout.mockResolvedValue(undefined);
    accounts.remove.mockResolvedValue(undefined);
    backups.list.mockResolvedValue([]);
    trash.list.mockResolvedValue([]);

    renderWithProviders(<App />);
    await waitFor(() =>
      expect(screen.getByText(/Aucune personne enregistrée/)).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sauvegardes' }));
    fireEvent.change(screen.getByLabelText('Profil local'), { target: { value: 'Alice' } });
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    await waitFor(() => expect(screen.getByText('Profil connecté : Alice')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Se déconnecter' }));
    await waitFor(() => expect(accounts.logout).toHaveBeenCalledWith('tok-1'));
    await waitFor(() =>
      expect(screen.getByText(/connectez-vous avec un profil local/)).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByLabelText('Profil local'), { target: { value: 'Alice' } });
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    await waitFor(() => expect(screen.getByText('Profil connecté : Alice')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer ce profil' }));
    await waitFor(() => expect(accounts.remove).toHaveBeenCalledWith(1, 'tok-1'));
    await waitFor(() =>
      expect(screen.getByText(/connectez-vous avec un profil local/)).toBeInTheDocument(),
    );
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

  it('détecte les doublons potentiels via le client API et permet de rejoindre une fiche', async () => {
    persons.list.mockResolvedValue([
      { id: 1, given_names: 'Jean', family_name: 'Dupont' },
      { id: 2, given_names: 'Jehan', family_name: 'Dupont' },
    ]);
    graph.relations.mockResolvedValue({
      person: { id: 1 },
      parents: [],
      children: [],
      siblings: [],
      spouses: [],
    });
    search.duplicates.mockResolvedValue([
      {
        persons: [
          { id: 1, given_names: 'Jean', family_name: 'Dupont' },
          { id: 2, given_names: 'Jehan', family_name: 'Dupont' },
        ],
        score: 92,
        requiresValidation: true,
      },
    ]);

    renderWithProviders(<App />);
    await waitFor(() => expect(screen.getByText('2 personne(s)')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Doublons' }));
    fireEvent.click(screen.getByRole('button', { name: 'Analyser les doublons potentiels' }));

    await waitFor(() => expect(search.duplicates).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText('92%')).toBeInTheDocument());

    fireEvent.click(screen.getAllByRole('button', { name: 'Voir la fiche B' })[0]);
    await waitFor(() => expect(graph.relations).toHaveBeenCalledWith(2));
  });

  it('fusionne un doublon via le client API et rafraîchit la liste réelle', async () => {
    persons.list.mockResolvedValueOnce([
      { id: 1, given_names: 'Jean', family_name: 'Dupont' },
      { id: 2, given_names: 'Jehan', family_name: 'Dupont' },
    ]);
    graph.relations.mockResolvedValue({
      person: { id: 1 },
      parents: [],
      children: [],
      siblings: [],
      spouses: [],
    });
    search.duplicates.mockResolvedValue([
      {
        persons: [
          { id: 1, given_names: 'Jean', family_name: 'Dupont' },
          { id: 2, given_names: 'Jehan', family_name: 'Dupont' },
        ],
        score: 92,
        requiresValidation: true,
      },
    ]);
    search.previewMerge.mockResolvedValue({
      survivor: { id: 1, given_names: 'Jean', family_name: 'Dupont' },
      duplicate: { id: 2, given_names: 'Jehan', family_name: 'Dupont' },
      reassignments: {
        parentagesAsParent: 0,
        parentagesAsChild: 1,
        unionPartnerships: 0,
        eventParticipations: 0,
        citations: 0,
        notes: 0,
        media: 0,
      },
    });
    search.merge.mockResolvedValue({ id: 1, given_names: 'Jean', family_name: 'Dupont' });
    persons.list.mockResolvedValueOnce([{ id: 1, given_names: 'Jean', family_name: 'Dupont' }]);

    renderWithProviders(<App />);
    await waitFor(() => expect(screen.getByText('2 personne(s)')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Doublons' }));
    fireEvent.click(screen.getByRole('button', { name: 'Analyser les doublons potentiels' }));
    await waitFor(() => expect(screen.getByText('92%')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Fusionner (garder A)' }));

    await waitFor(() => expect(search.previewMerge).toHaveBeenCalledWith(1, 2));
    await waitFor(() => expect(screen.getByText(/lien\(s\) enfant → parent/)).toBeInTheDocument());
    expect(search.merge).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmer la fusion' }));

    await waitFor(() => expect(search.merge).toHaveBeenCalledWith(1, 2));
    await waitFor(() =>
      expect(screen.getByText('Aucun doublon potentiel détecté.')).toBeInTheDocument(),
    );
  });

  it('gère les familles (unions) d’une personne via le client API', async () => {
    persons.list.mockResolvedValue([
      { id: 1, given_names: 'Jean', family_name: 'Dupont' },
      { id: 2, given_names: 'Marie', family_name: 'Curie' },
    ]);
    graph.relations.mockResolvedValue({
      person: { id: 1 },
      parents: [],
      children: [],
      siblings: [],
      spouses: [],
    });
    unions.listForPerson
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 7, type: 'MARRIAGE', partnerIds: [1, 2] }]);
    unions.create.mockResolvedValue({ id: 7, type: 'MARRIAGE', partnerIds: [1, 2] });

    renderWithProviders(<App />);
    await waitFor(() => expect(screen.getByText('2 personne(s)')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Familles' }));
    await waitFor(() => expect(unions.listForPerson).toHaveBeenCalledWith(1));
    await waitFor(() => expect(screen.getByText(/Aucune union enregistrée/)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Partenaire'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Créer l’union' }));

    await waitFor(() =>
      expect(unions.create).toHaveBeenCalledWith({ type: 'MARRIAGE', partnerIds: [1, 2] }),
    );
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Marie Curie' }).length).toBeGreaterThan(1),
    );
  });

  it('gère le carnet de recherche via le client API (aucune donnée fictive)', async () => {
    persons.list.mockResolvedValue([]);
    research.list.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: 1,
        title: 'Acte à vérifier',
        content: 'Registre paroissial 1850',
        status: 'TODO',
        priority: 'MEDIUM',
      },
    ]);
    research.create.mockResolvedValue({ id: 1 });

    renderWithProviders(<App />);
    await waitFor(() =>
      expect(screen.getByText(/Aucune personne enregistrée/)).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Carnet' }));
    await waitFor(() => expect(screen.getByText(/Aucune piste de recherche/)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Titre'), { target: { value: 'Acte à vérifier' } });
    fireEvent.change(screen.getByLabelText('Note'), {
      target: { value: 'Registre paroissial 1850' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une piste de recherche' }));

    await waitFor(() =>
      expect(research.create).toHaveBeenCalledWith({
        title: 'Acte à vérifier',
        content: 'Registre paroissial 1850',
        status: 'TODO',
        priority: 'MEDIUM',
        personId: null,
      }),
    );
    await waitFor(() => expect(screen.getByText(/Registre paroissial 1850/)).toBeInTheDocument());
  });

  it('rattache une piste de recherche à une personne existante et permet d’y naviguer', async () => {
    persons.list.mockResolvedValue([{ id: 1, given_names: 'Jean', family_name: 'Dupont' }]);
    graph.relations.mockResolvedValue({
      person: { id: 1 },
      parents: [],
      children: [],
      siblings: [],
      spouses: [],
    });
    research.list.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: 1,
        title: 'Vérifier acte',
        content: 'Mairie de Nantes',
        status: 'TODO',
        priority: 'MEDIUM',
        person_id: 1,
      },
    ]);
    research.create.mockResolvedValue({ id: 1 });

    renderWithProviders(<App />);
    await waitFor(() => expect(screen.getByText('1 personne(s)')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Carnet' }));
    fireEvent.change(screen.getByLabelText('Titre'), { target: { value: 'Vérifier acte' } });
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Mairie de Nantes' } });
    fireEvent.change(screen.getByLabelText('Personne liée (optionnel)'), {
      target: { value: '1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une piste de recherche' }));

    await waitFor(() =>
      expect(research.create).toHaveBeenCalledWith({
        title: 'Vérifier acte',
        content: 'Mairie de Nantes',
        status: 'TODO',
        priority: 'MEDIUM',
        personId: 1,
      }),
    );

    const navigateButtons = screen.getAllByRole('button', { name: 'Jean Dupont' });
    fireEvent.click(navigateButtons[navigateButtons.length - 1]);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Arbre' })).toHaveClass('is-active'),
    );
  });

  it('affiche les statistiques réelles via le client API', async () => {
    persons.list.mockResolvedValue([]);
    statistics.totals.mockResolvedValue({
      totals: { persons: 3, places: 1, events: 0, unions: 0, parentages: 0, sources: 0, media: 0 },
      generatedAt: '2026-09-22T00:00:00.000Z',
    });

    renderWithProviders(<App />);
    await waitFor(() =>
      expect(screen.getByText(/Aucune personne enregistrée/)).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Statistiques' }));

    await waitFor(() => expect(statistics.totals).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText('3')).toBeInTheDocument());
  });

  it('affiche une erreur honnête quand l’IA locale est indisponible (aucune réponse fictive)', async () => {
    persons.list.mockResolvedValue([]);
    const unavailable = Object.assign(new Error('L’IA locale est désactivée'), { status: 503 });
    ai.analyze.mockRejectedValue(unavailable);

    renderWithProviders(<App />);
    await waitFor(() =>
      expect(screen.getByText(/Aucune personne enregistrée/)).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'IA locale' }));
    fireEvent.change(screen.getByLabelText('Question'), { target: { value: 'Résume la famille' } });
    fireEvent.click(screen.getByRole('button', { name: 'Analyser' }));

    await waitFor(() => expect(ai.analyze).toHaveBeenCalledWith('Résume la famille'));
    await waitFor(() => expect(screen.getByText('L’IA locale est désactivée')).toBeInTheDocument());
  });

  it('affiche la réponse réelle de l’IA locale quand elle est disponible', async () => {
    persons.list.mockResolvedValue([]);
    ai.analyze.mockResolvedValue({
      model: 'llama3',
      response: 'Trois personnes enregistrées.',
      generatedAt: '2026-09-22T00:00:00.000Z',
    });

    renderWithProviders(<App />);
    await waitFor(() =>
      expect(screen.getByText(/Aucune personne enregistrée/)).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'IA locale' }));
    fireEvent.change(screen.getByLabelText('Question'), { target: { value: 'Résume' } });
    fireEvent.click(screen.getByRole('button', { name: 'Analyser' }));

    await waitFor(() =>
      expect(screen.getByText('Trois personnes enregistrées.')).toBeInTheDocument(),
    );
  });

  it('ajoute et affiche des notes réelles sur une personne, y compris les contradictions', async () => {
    persons.list.mockResolvedValue([{ id: 1, given_names: 'Jean', family_name: 'Dupont' }]);
    graph.relations.mockResolvedValue({
      person: { id: 1 },
      parents: [],
      children: [],
      siblings: [],
      spouses: [],
    });
    notes.listForEntity.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: 1,
        body: 'Deux actes de naissance différents circulent pour cette personne.',
        confidence: 'LOW',
        is_contradiction: true,
      },
    ]);
    notes.create.mockResolvedValue({ id: 1 });

    renderWithProviders(<App />);
    await waitFor(() => expect(screen.getByText('1 personne(s)')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Notes' }));
    await waitFor(() => expect(notes.listForEntity).toHaveBeenCalledWith('PERSON', 1));
    await waitFor(() => expect(screen.getByText(/Aucune note/)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Note'), {
      target: { value: 'Deux actes de naissance différents circulent pour cette personne.' },
    });
    fireEvent.change(screen.getByLabelText('Niveau de confiance'), {
      target: { value: 'LOW' },
    });
    fireEvent.click(screen.getByLabelText(/Signale une contradiction/));
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter la note' }));

    await waitFor(() =>
      expect(notes.create).toHaveBeenCalledWith({
        entityType: 'PERSON',
        entityId: 1,
        body: 'Deux actes de naissance différents circulent pour cette personne.',
        confidence: 'LOW',
        isContradiction: true,
      }),
    );
    await waitFor(() => expect(screen.getByText('Contradiction')).toBeInTheDocument());
  });

  it('téléverse et liste des médias réels pour une personne, avec statut OCR', async () => {
    persons.list.mockResolvedValue([{ id: 1, given_names: 'Jean', family_name: 'Dupont' }]);
    graph.relations.mockResolvedValue({
      person: { id: 1 },
      parents: [],
      children: [],
      siblings: [],
      spouses: [],
    });
    media.listForEntity
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 1, original_filename: 'acte.txt', ocr_status: 'UNAVAILABLE' }]);
    media.upload.mockResolvedValue({ id: 1 });

    renderWithProviders(<App />);
    await waitFor(() => expect(screen.getByText('1 personne(s)')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Médias' }));
    await waitFor(() => expect(media.listForEntity).toHaveBeenCalledWith('PERSON', 1));
    await waitFor(() => expect(screen.getByText(/Aucun média/)).toBeInTheDocument());

    const file = new File(['contenu'], 'acte.txt', { type: 'text/plain' });
    fireEvent.change(screen.getByLabelText('Ajouter un fichier'), {
      target: { files: [file] },
    });

    await waitFor(() =>
      expect(media.upload).toHaveBeenCalledWith(
        expect.objectContaining({
          filename: 'acte.txt',
          entityType: 'PERSON',
          entityId: 1,
        }),
      ),
    );
    await waitFor(() => expect(screen.getByText('acte.txt')).toBeInTheDocument());
    expect(screen.getByText('UNAVAILABLE')).toBeInTheDocument();
  });

  it('crée une source et la cite pour une personne, avec niveau de confiance réel', async () => {
    persons.list.mockResolvedValue([{ id: 1, given_names: 'Jean', family_name: 'Dupont' }]);
    graph.relations.mockResolvedValue({
      person: { id: 1 },
      parents: [],
      children: [],
      siblings: [],
      spouses: [],
    });
    sources.listCitationsForEntity
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 1, source_id: 7, page: 'p.42', confidence: 'HIGH' }]);
    sources.create.mockResolvedValue({ id: 7, title: 'Registre paroissial 1815' });
    sources.get.mockResolvedValue({ id: 7, title: 'Registre paroissial 1815' });
    sources.addCitation.mockResolvedValue({ id: 1 });

    renderWithProviders(<App />);
    await waitFor(() => expect(screen.getByText('1 personne(s)')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Sources' }));
    await waitFor(() => expect(sources.listCitationsForEntity).toHaveBeenCalledWith('PERSON', 1));
    await waitFor(() => expect(screen.getByText(/Aucune source citée/)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Titre de la source'), {
      target: { value: 'Registre paroissial 1815' },
    });
    fireEvent.change(screen.getByLabelText('Page / référence (optionnel)'), {
      target: { value: 'p.42' },
    });
    fireEvent.change(screen.getByLabelText('Niveau de confiance'), {
      target: { value: 'HIGH' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter et citer la source' }));

    await waitFor(() =>
      expect(sources.create).toHaveBeenCalledWith({
        title: 'Registre paroissial 1815',
        author: null,
      }),
    );
    await waitFor(() =>
      expect(sources.addCitation).toHaveBeenCalledWith({
        sourceId: 7,
        entityType: 'PERSON',
        entityId: 1,
        page: 'p.42',
        confidence: 'HIGH',
      }),
    );
    await waitFor(() => expect(screen.getByText(/Registre paroissial 1815/)).toBeInTheDocument());
  });

  it('liste et permet de télécharger les documents réels attachés à une source citée', async () => {
    persons.list.mockResolvedValue([{ id: 1, given_names: 'Jean', family_name: 'Dupont' }]);
    graph.relations.mockResolvedValue({
      person: { id: 1 },
      parents: [],
      children: [],
      siblings: [],
      spouses: [],
    });
    sources.listCitationsForEntity.mockResolvedValue([
      { id: 1, source_id: 7, page: 'p.42', confidence: 'HIGH' },
    ]);
    sources.get.mockResolvedValue({ id: 7, title: 'Registre paroissial 1815' });
    media.listForSource.mockResolvedValue([{ id: 9, original_filename: 'scan-registre.png' }]);
    media.download.mockResolvedValue({ filename: 'scan-registre.png', blob: new Blob() });
    const clickSpy = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:mock', revokeObjectURL: vi.fn() });
    HTMLAnchorElement.prototype.click = clickSpy;

    renderWithProviders(<App />);
    await waitFor(() => expect(screen.getByText('1 personne(s)')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Sources' }));

    await waitFor(() => expect(media.listForSource).toHaveBeenCalledWith(7));
    await waitFor(() => expect(screen.getByText('scan-registre.png')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Télécharger' }));
    await waitFor(() => expect(media.download).toHaveBeenCalledWith(9));
    expect(clickSpy).toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it('ajoute un parent et un enfant réels à une personne, avec navigation', async () => {
    persons.list.mockResolvedValue([
      { id: 1, given_names: 'Jean', family_name: 'Dupont' },
      { id: 2, given_names: 'Louis', family_name: 'Dupont' },
      { id: 3, given_names: 'Alice', family_name: 'Dupont' },
    ]);
    graph.relations.mockResolvedValue({
      person: { id: 1 },
      parents: [],
      children: [],
      siblings: [],
      spouses: [],
    });
    unions.listForPerson.mockResolvedValue([]);
    parentages.listParentsOf
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 10, child_id: 1, parent_id: 2, parent_role: 'FATHER' }]);
    parentages.listChildrenOf.mockResolvedValue([]);
    parentages.create.mockResolvedValue({ id: 10 });

    renderWithProviders(<App />);
    await waitFor(() => expect(screen.getByText('3 personne(s)')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Familles' }));
    await waitFor(() => expect(parentages.listParentsOf).toHaveBeenCalledWith(1));

    fireEvent.change(screen.getByLabelText('Ajouter un parent'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Rôle'), { target: { value: 'FATHER' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter le parent' }));

    await waitFor(() =>
      expect(parentages.create).toHaveBeenCalledWith({
        childId: 1,
        parentId: 2,
        parentRole: 'FATHER',
      }),
    );
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Louis Dupont' }).length).toBeGreaterThan(1),
    );
  });

  it('ajoute un événement réel à une personne, avec un nouveau lieu créé à la volée', async () => {
    persons.list.mockResolvedValue([{ id: 1, given_names: 'Jean', family_name: 'Dupont' }]);
    graph.relations.mockResolvedValue({
      person: { id: 1 },
      parents: [],
      children: [],
      siblings: [],
      spouses: [],
    });
    events.listForPerson
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 1, type: 'BIRTH', date_text: '12 avril 1850', place_id: 9 }]);
    places.create.mockResolvedValue({ id: 9, name: 'Nantes' });
    events.create.mockResolvedValue({ id: 1 });

    renderWithProviders(<App />);
    await waitFor(() => expect(screen.getByText('1 personne(s)')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Événements' }));
    await waitFor(() => expect(events.listForPerson).toHaveBeenCalledWith(1));

    fireEvent.change(screen.getByLabelText('Date (texte libre)'), {
      target: { value: '12 avril 1850' },
    });
    fireEvent.change(screen.getByLabelText('Ou nouveau lieu (optionnel)'), {
      target: { value: 'Nantes' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter l’événement' }));

    await waitFor(() => expect(places.create).toHaveBeenCalledWith({ name: 'Nantes' }));
    await waitFor(() =>
      expect(events.create).toHaveBeenCalledWith({
        type: 'BIRTH',
        dateText: '12 avril 1850',
        datePrecision: 'EXACT',
        placeId: 9,
        participants: [{ personId: 1, role: 'PRINCIPAL' }],
      }),
    );
    await waitFor(() => expect(screen.getAllByText(/Nantes/).length).toBeGreaterThan(0));
  });

  it('affiche la chronologie réelle de tous les événements avec lieu et participants', async () => {
    persons.list.mockResolvedValue([{ id: 1, given_names: 'Jean', family_name: 'Dupont' }]);
    graph.relations.mockResolvedValue({
      person: { id: 1 },
      parents: [],
      children: [],
      siblings: [],
      spouses: [],
    });
    events.listAll.mockResolvedValue([
      {
        id: 1,
        type: 'BIRTH',
        date_text: '12 avril 1850',
        place_name: 'Nantes',
        participants: [{ personId: 1, personGivenNames: 'Jean', personFamilyName: 'Dupont' }],
      },
    ]);

    renderWithProviders(<App />);
    await waitFor(() => expect(screen.getByText('1 personne(s)')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Chronologie' }));

    await waitFor(() => expect(events.listAll).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText(/12 avril 1850/)).toBeInTheDocument());
    expect(screen.getByText(/Nantes/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Voir Jean' })).toBeInTheDocument();
  });

  it('affiche la carte réelle des lieux avec coordonnées et sépare ceux sans coordonnées', async () => {
    persons.list.mockResolvedValue([{ id: 1, given_names: 'Jean', family_name: 'Dupont' }]);
    graph.relations.mockResolvedValue({
      person: { id: 1 },
      parents: [],
      children: [],
      siblings: [],
      spouses: [],
    });
    places.list.mockResolvedValueOnce([
      { id: 1, name: 'Nantes', latitude: 47.2184, longitude: -1.5536 },
      { id: 2, name: 'Lieu inconnu', latitude: null, longitude: null },
    ]);

    renderWithProviders(<App />);
    await waitFor(() => expect(screen.getByText('1 personne(s)')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Carte' }));

    await waitFor(() =>
      expect(screen.getByRole('img', { name: /Carte des lieux/ })).toBeInTheDocument(),
    );
    expect(screen.getByText('Nantes')).toBeInTheDocument();
    expect(screen.getByText('Lieu inconnu')).toBeInTheDocument();
  });

  it('signale les incohérences réelles détectées par le moteur (cycle et chronologie)', async () => {
    persons.list.mockResolvedValue([
      { id: 1, given_names: 'Jean', family_name: 'Dupont' },
      { id: 2, given_names: 'Marie', family_name: 'Curie' },
    ]);
    graph.relations.mockResolvedValue({
      person: { id: 1 },
      parents: [],
      children: [],
      siblings: [],
      spouses: [],
    });
    graph.cycles.mockResolvedValue([[1, 2, 1]]);
    graph.timeline.mockResolvedValue([
      { personId: 1, code: 'BIRTH_AFTER_DEATH', severity: 'CERTAIN' },
    ]);

    renderWithProviders(<App />);
    await waitFor(() => expect(screen.getByText('2 personne(s)')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Cohérence' }));
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier la cohérence de l’arbre' }));

    await waitFor(() => expect(graph.cycles).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByText(/Naissance enregistrée après le décès/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Jean Dupont → Marie Curie → Jean Dupont/)).toBeInTheDocument();
  });

  it('calcule les ancêtres communs réels entre la fiche sélectionnée et une autre personne', async () => {
    persons.list.mockResolvedValue([
      { id: 1, given_names: 'Jean', family_name: 'Dupont' },
      { id: 2, given_names: 'Marie', family_name: 'Curie' },
    ]);
    graph.relations.mockResolvedValue({
      person: { id: 1 },
      parents: [],
      children: [],
      siblings: [],
      spouses: [],
    });
    graph.commonAncestors.mockResolvedValue([
      {
        person: { id: 3, given_names: 'Aïeul', family_name: 'Commun' },
        generationFromA: 2,
        generationFromB: 3,
      },
    ]);

    renderWithProviders(<App />);
    await waitFor(() => expect(screen.getByText('2 personne(s)')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Comparer avec'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Comparer' }));

    await waitFor(() => expect(graph.commonAncestors).toHaveBeenCalledWith(1, 2));
    await waitFor(() => expect(screen.getByText(/Aïeul Commun/)).toBeInTheDocument());
  });

  it('affiche le journal d’audit réel d’une personne', async () => {
    persons.list.mockResolvedValue([{ id: 1, given_names: 'Jean', family_name: 'Dupont' }]);
    graph.relations.mockResolvedValue({
      person: { id: 1 },
      parents: [],
      children: [],
      siblings: [],
      spouses: [],
    });
    audit.listForEntity.mockResolvedValue([
      { id: 1, operation: 'INSERT', performed_at: '2026-09-22T10:00:00.000Z', performed_by: null },
    ]);

    renderWithProviders(<App />);
    await waitFor(() => expect(screen.getByText('1 personne(s)')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Journal' }));

    await waitFor(() => expect(audit.listForEntity).toHaveBeenCalledWith('persons', 1));
    await waitFor(() => expect(screen.getByText('INSERT')).toBeInTheDocument());
  });
});
