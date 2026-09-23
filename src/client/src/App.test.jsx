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
  ancestors: vi.fn(),
  descendants: vi.fn(),
  relationship: vi.fn(),
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
  restore: vi.fn(),
  exportEncrypted: vi.fn(),
  importEncrypted: vi.fn(),
}));
const trash = vi.hoisted(() => ({
  list: vi.fn(),
  restore: vi.fn(),
  purge: vi.fn(),
}));
const unions = vi.hoisted(() => ({
  create: vi.fn(),
  listForPerson: vi.fn(),
  remove: vi.fn(),
}));
const research = vi.hoisted(() => ({
  create: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  addHypothesis: vi.fn(),
  updateHypothesis: vi.fn(),
  addEvidence: vi.fn(),
  removeEvidence: vi.fn(),
  addTask: vi.fn(),
  updateTask: vi.fn(),
  removeTask: vi.fn(),
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
  photo: vi.fn(),
  updatePhoto: vi.fn(),
  addRegion: vi.fn(),
  removeRegion: vi.fn(),
  photosForPerson: vi.fn().mockResolvedValue([]),
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

const history = vi.hoisted(() => ({
  status: vi.fn().mockResolvedValue({ canUndo: false, canRedo: false }),
  undo: vi.fn(),
  redo: vi.fn(),
}));
const storage = vi.hoisted(() => ({
  status: vi.fn(),
  setMirror: vi.fn(),
  setDataDir: vi.fn(),
}));
const trees = vi.hoisted(() => ({
  list: vi.fn(),
  active: vi.fn().mockResolvedValue({ id: 'default', name: 'Mon arbre', active: true }),
  listDeleted: vi.fn().mockResolvedValue([]),
  create: vi.fn(),
  update: vi.fn(),
  activate: vi.fn(),
  remove: vi.fn(),
  restore: vi.fn(),
}));

const advancedSearch = vi.hoisted(() => vi.fn());
const quality = vi.hoisted(() => vi.fn());

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
    trees,
    history,
    storage,
    advancedSearch,
    quality,
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

    fireEvent.click(screen.getByRole('button', { name: 'Corbeille' }));
    await waitFor(() => expect(screen.getByText(/Jean Dupont/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Purger définitivement' }));
    expect(trash.purge).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(screen.getByRole('button', { name: 'Purger définitivement' })).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole('button', { name: 'Profil local' }));
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer ce profil' }));
    expect(accounts.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer la suppression du profil' }));
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
  it('affiche l’arbre ascendant réel avec numéros Sosa et branches', async () => {
    persons.list.mockResolvedValue([{ id: 1, given_names: 'Jean', family_name: 'Dupont' }]);
    graph.relations.mockResolvedValue({
      person: { id: 1 },
      parents: [],
      children: [],
      siblings: [],
      spouses: [],
    });
    graph.ancestors.mockResolvedValue([
      { id: 2, given_names: 'Pierre', family_name: 'Dupont', sex: 'M', generation: 1, viaId: 1 },
      { id: 3, given_names: 'Anne', family_name: 'Morel', sex: 'F', generation: 1, viaId: 1 },
    ]);

    renderWithProviders(<App />);
    await waitFor(() => expect(screen.getByText('1 personne(s)')).toBeInTheDocument());

    fireEvent.click(await screen.findByRole('button', { name: 'Ascendant' }));

    await waitFor(() => expect(graph.ancestors).toHaveBeenCalledWith(1, 4));
    await waitFor(() => expect(screen.getByText('Sosa 2')).toBeInTheDocument());
    expect(screen.getByText('Sosa 3')).toBeInTheDocument();
    expect(screen.getByLabelText('Branche maternelle')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ascendant' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Zoom avant' }));
    expect(screen.getByText('110 %')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Recentrer' }));
    expect(screen.getByText('100 %')).toBeInTheDocument();
  });

  it('calcule la parenté entre deux personnes via le moteur', async () => {
    persons.list.mockResolvedValue([
      { id: 1, given_names: 'Jean', family_name: 'Dupont' },
      { id: 2, given_names: 'Marie', family_name: 'Martin' },
    ]);
    graph.relations.mockResolvedValue({
      person: { id: 1 },
      parents: [],
      children: [],
      siblings: [],
      spouses: [],
    });
    graph.relationship.mockResolvedValue({
      relationship: 'COUSIN',
      distance: 4,
      branch: null,
      label: 'cousine germaine',
      path: [
        { personId: 1, via: 'SELF' },
        { personId: 2, via: 'CHILD' },
      ],
    });
    graph.commonAncestors.mockResolvedValue([]);

    renderWithProviders(<App />);
    await waitFor(() => expect(screen.getByText('2 personne(s)')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Parenté' }));
    fireEvent.change(screen.getByLabelText('Seconde personne'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Calculer la parenté' }));

    await waitFor(() => expect(graph.relationship).toHaveBeenCalledWith(1, 2));
    await waitFor(() => expect(screen.getByText('cousine germaine')).toBeInTheDocument());
    expect(screen.getByText('Aucun ancêtre commun enregistré.')).toBeInTheDocument();
  });

  it('ouvre la fiche personne avec des onglets navigables au clavier', async () => {
    persons.list.mockResolvedValue([
      { id: 1, given_names: 'Jean', family_name: 'Dupont', sex: 'M', is_living: 0 },
    ]);
    graph.relations.mockResolvedValue({
      person: { id: 1 },
      parents: [],
      children: [],
      siblings: [],
      spouses: [],
    });
    events.listForPerson.mockResolvedValue([]);

    renderWithProviders(<App />);
    await waitFor(() => expect(screen.getByText('1 personne(s)')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Personne' }));

    expect(screen.getByText('Homme')).toBeInTheDocument();
    expect(screen.getByText('Décédé(e)')).toBeInTheDocument();
    const identityTab = screen.getByRole('tab', { name: 'Identité' });
    expect(identityTab).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(identityTab, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Événements' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await waitFor(() => expect(events.listForPerson).toHaveBeenCalledWith(1));
  });
  it('applique et mémorise les paramètres d’affichage', async () => {
    persons.list.mockResolvedValue([]);
    renderWithProviders(<App />);
    await waitFor(() =>
      expect(screen.getByText(/Aucune personne enregistrée/)).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Paramètres' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Sombre — Salle d’archives' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Très grande' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Compacte' }));

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.dataset.textSize).toBe('xlarge');
    expect(document.documentElement.dataset.density).toBe('compact');
    expect(JSON.parse(localStorage.getItem('geneoapp.settings')).theme).toBe('dark');

    fireEvent.click(screen.getByRole('button', { name: 'Passer au thème clair' }));
    expect(document.documentElement.dataset.theme).toBe('light');

    fireEvent.click(screen.getByRole('button', { name: 'Rétablir les valeurs par défaut' }));
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(document.documentElement.dataset.textSize).toBeUndefined();
    localStorage.clear();
  });

  it('affiche l’éventail des ancêtres avec secteurs Sosa navigables', async () => {
    persons.list.mockResolvedValue([{ id: 1, given_names: 'Jean', family_name: 'Dupont' }]);
    graph.relations.mockResolvedValue({
      person: { id: 1 },
      parents: [],
      children: [],
      siblings: [],
      spouses: [],
    });
    graph.ancestors.mockResolvedValue([
      { id: 2, given_names: 'Pierre', family_name: 'Dupont', sex: 'M', generation: 1, viaId: 1 },
      { id: 3, given_names: 'Anne', family_name: 'Morel', sex: 'F', generation: 1, viaId: 1 },
    ]);

    renderWithProviders(<App />);
    await waitFor(() => expect(screen.getByText('1 personne(s)')).toBeInTheDocument());
    fireEvent.click(await screen.findByRole('button', { name: 'Éventail' }));

    const mother = await screen.findByRole('button', { name: 'Anne Morel, Sosa 3' });
    expect(screen.getByRole('button', { name: 'Pierre Dupont, Sosa 2' })).toBeInTheDocument();
    fireEvent.keyDown(mother, { key: 'Enter' });
    await waitFor(() => expect(graph.relations).toHaveBeenCalledWith(3));
  });
  it('crée et ouvre un autre arbre, puis recharge les personnes de cet arbre', async () => {
    persons.list
      .mockResolvedValueOnce([{ id: 1, given_names: 'Jean', family_name: 'Dupont' }])
      .mockResolvedValueOnce([]);
    graph.relations.mockResolvedValue({
      person: { id: 1 },
      parents: [],
      children: [],
      siblings: [],
      spouses: [],
    });
    const second = {
      id: 'abc-1',
      name: 'Famille Morel',
      active: false,
      createdAt: '2026-09-23T10:00:00Z',
      personCount: null,
    };
    trees.list.mockResolvedValue([
      {
        id: 'default',
        name: 'Mon arbre',
        active: true,
        createdAt: '2026-09-22T10:00:00Z',
        personCount: 1,
      },
      second,
    ]);
    trees.activate.mockResolvedValue({ ...second, active: true, personCount: 0 });

    renderWithProviders(<App />);
    await waitFor(() => expect(screen.getByText('1 personne(s)')).toBeInTheDocument());
    expect(await screen.findByRole('button', { name: 'Mon arbre' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Arbres' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir Famille Morel' }));

    await waitFor(() => expect(trees.activate).toHaveBeenCalledWith('abc-1'));
    await waitFor(() => expect(screen.getByText('0 personne(s)')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Famille Morel' })).toBeInTheDocument();
  });
  it('annule la dernière action via le bouton puis Ctrl+Z, sans intercepter la frappe', async () => {
    persons.list
      .mockResolvedValueOnce([{ id: 1, given_names: 'Jean', family_name: 'Dupont' }])
      .mockResolvedValue([]);
    graph.relations.mockResolvedValue({
      person: { id: 1 },
      parents: [],
      children: [],
      siblings: [],
      spouses: [],
    });
    history.status.mockResolvedValue({
      canUndo: true,
      canRedo: false,
      undoLabel: 'Ajout · personne',
      redoLabel: null,
    });
    history.undo.mockResolvedValue({
      undone: 'Ajout · personne',
      canUndo: false,
      canRedo: true,
      undoLabel: null,
      redoLabel: 'Ajout · personne',
    });
    history.redo.mockResolvedValue({
      redone: 'Ajout · personne',
      canUndo: true,
      canRedo: false,
      undoLabel: 'Ajout · personne',
      redoLabel: null,
    });

    renderWithProviders(<App />);
    await waitFor(() => expect(screen.getByText('1 personne(s)')).toBeInTheDocument());

    fireEvent.click(await screen.findByRole('button', { name: 'Annuler : Ajout · personne' }));
    await waitFor(() => expect(history.undo).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('0 personne(s)')).toBeInTheDocument());
    expect(screen.getByText('Annulé : Ajout · personne')).toBeInTheDocument();

    fireEvent.keyDown(screen.getByLabelText('Prénom(s)'), { key: 'z', ctrlKey: true });
    expect(history.undo).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true });
    await waitFor(() => expect(history.redo).toHaveBeenCalledTimes(1));
    history.status.mockResolvedValue({ canUndo: false, canRedo: false });
  });
  it('ouvre une recherche et y ajoute hypothèse, preuve et tâche', async () => {
    persons.list.mockResolvedValue([]);
    const base = {
      id: 7,
      title: 'Mariage de Jean',
      content: 'Recherche #42',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      due_date: null,
      objective: 'Trouver l’acte',
      archives: null,
      result: null,
      person_id: null,
    };
    research.list.mockResolvedValue([
      { ...base, task_count: 0, done_task_count: 0, hypothesis_count: 0 },
    ]);
    research.get.mockResolvedValueOnce({ ...base, hypotheses: [], tasks: [] }).mockResolvedValue({
      ...base,
      hypotheses: [
        {
          id: 3,
          title: 'Né à Nantes',
          content: '',
          status: 'OPEN',
          evidence: [{ id: 9, stance: 'CONTRADICTS', content: 'Aucun acte' }],
        },
      ],
      tasks: [
        {
          id: 5,
          title: 'Écrire à la mairie',
          status: 'TODO',
          priority: 'HIGH',
          due_date: '2020-01-01',
        },
      ],
    });
    research.addHypothesis.mockResolvedValue({ id: 3 });
    research.addTask.mockResolvedValue({ id: 5 });
    research.addEvidence.mockResolvedValue({ id: 9 });
    research.updateTask.mockResolvedValue({ id: 5 });

    renderWithProviders(<App />);
    await waitFor(() =>
      expect(screen.getByText(/Aucune personne enregistrée/)).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Carnet' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Mariage de Jean' }));

    fireEvent.change(await screen.findByLabelText('Nouvelle hypothèse'), {
      target: { value: 'Né à Nantes' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter l’hypothèse' }));
    await waitFor(() =>
      expect(research.addHypothesis).toHaveBeenCalledWith(7, { title: 'Né à Nantes', content: '' }),
    );

    fireEvent.change(await screen.findByLabelText('Preuve pour « Né à Nantes »'), {
      target: { value: 'Registre 1836' },
    });
    fireEvent.change(screen.getByLabelText('Sens'), { target: { value: 'SUPPORTS' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter la preuve' }));
    await waitFor(() =>
      expect(research.addEvidence).toHaveBeenCalledWith(3, {
        stance: 'SUPPORTS',
        content: 'Registre 1836',
      }),
    );
    expect(screen.getByText('Aucun acte')).toBeInTheDocument();
    expect(screen.getByText(/En retard/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Écrire à la mairie' }));
    await waitFor(() => expect(research.updateTask).toHaveBeenCalledWith(5, { status: 'DONE' }));
  });
  it('exporte la branche maternelle de la personne de contexte', async () => {
    persons.list.mockResolvedValue([{ id: 4, given_names: 'Jean', family_name: 'Dupont' }]);
    graph.relations.mockResolvedValue({
      person: { id: 4 },
      parents: [],
      children: [],
      siblings: [],
      spouses: [],
    });
    gedcom.export.mockResolvedValue({
      format: '5.5.1',
      gedcom: '0 HEAD\n0 TRLR\n',
      summary: { persons: 3, families: 1 },
    });
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:mock'), revokeObjectURL: vi.fn() });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    renderWithProviders(<App />);
    await waitFor(() => expect(screen.getByText('1 personne(s)')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'GEDCOM' }));
    fireEvent.change(screen.getByLabelText('Format d’export'), { target: { value: '5.5.1' } });
    fireEvent.change(screen.getByLabelText('Périmètre'), { target: { value: 'maternal' } });
    fireEvent.click(screen.getByRole('button', { name: 'Exporter le périmètre' }));

    await waitFor(() =>
      expect(gedcom.export).toHaveBeenCalledWith({
        format: '5.5.1',
        branchOf: 4,
        side: 'MATERNAL',
      }),
    );
    expect(await screen.findByText('Exporté : 3 personne(s), 1 famille(s)')).toBeInTheDocument();
    clickSpy.mockRestore();
    vi.unstubAllGlobals();
  });
  it('identifie une personne sur une photo via la saisie clavier de la zone', async () => {
    persons.list.mockResolvedValue([
      { id: 1, given_names: 'Jean', family_name: 'Dupont' },
      { id: 2, given_names: 'Marie', family_name: 'Martin' },
    ]);
    graph.relations.mockResolvedValue({
      person: { id: 1 },
      parents: [],
      children: [],
      siblings: [],
      spouses: [],
    });
    media.listForEntity.mockResolvedValue([
      { id: 8, original_filename: 'mariage.png', ocr_status: 'UNAVAILABLE', entity_id: 1 },
    ]);
    const photo = {
      id: 8,
      original_filename: 'mariage.png',
      mime_type: 'image/png',
      size_bytes: 2048,
      taken_date: null,
      place_id: null,
      description: null,
      tags: null,
    };
    media.photo.mockResolvedValueOnce({ ...photo, regions: [] }).mockResolvedValue({
      ...photo,
      regions: [
        {
          id: 3,
          person_id: 2,
          given_names: 'Marie',
          family_name: 'Martin',
          x: 0.1,
          y: 0.1,
          width: 0.2,
          height: 0.25,
        },
      ],
    });
    media.download.mockResolvedValue({ filename: 'mariage.png', blob: new Blob(['x']) });
    media.addRegion.mockResolvedValue({ id: 3 });
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:photo'), revokeObjectURL: vi.fn() });

    renderWithProviders(<App />);
    await waitFor(() => expect(screen.getByText('2 personne(s)')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Médias' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir mariage.png' }));

    fireEvent.change(await screen.findByLabelText('Personne présente'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la zone saisie' }));

    await waitFor(() =>
      expect(media.addRegion).toHaveBeenCalledWith(8, {
        x: 0.1,
        y: 0.1,
        width: 0.2,
        height: 0.25,
        personId: 2,
      }),
    );
    expect(
      await screen.findByRole('button', { name: 'Retirer Marie Martin de la photo' }),
    ).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
  it('lit la date saisie et en déduit la précision (« vers 1812 » → ABOUT)', async () => {
    persons.list.mockResolvedValue([{ id: 1, given_names: 'Jean', family_name: 'Dupont' }]);
    graph.relations.mockResolvedValue({
      person: { id: 1 },
      parents: [],
      children: [],
      siblings: [],
      spouses: [],
    });
    events.listForPerson.mockResolvedValue([]);

    renderWithProviders(<App />);
    await waitFor(() => expect(screen.getByText('1 personne(s)')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Événements' }));

    fireEvent.change(await screen.findByLabelText('Date (texte libre)'), {
      target: { value: 'ABT 1812' },
    });
    expect(screen.getByText('Lu comme : vers 1812')).toBeInTheDocument();
    expect(screen.getByLabelText('Précision de date')).toHaveValue('ABOUT');

    fireEvent.change(screen.getByLabelText('Date (texte libre)'), {
      target: { value: 'le jour de la foire' },
    });
    expect(screen.getByText(/Date non reconnue/)).toBeInTheDocument();
    expect(screen.getByLabelText('Précision de date')).toHaveValue('UNKNOWN');
  });
  it('affiche les années de vie, replie une branche et isole la branche maternelle', async () => {
    persons.list.mockResolvedValue([{ id: 1, given_names: 'Jean', family_name: 'Dupont' }]);
    graph.relations.mockResolvedValue({
      person: { id: 1 },
      parents: [],
      children: [],
      siblings: [],
      spouses: [],
    });
    events.listAll.mockResolvedValue([
      { type: 'BIRTH', date_text: 'vers 1760', participants: [{ personId: 2, role: 'PRINCIPAL' }] },
      { type: 'DEATH', date_text: '1822', participants: [{ personId: 2, role: 'PRINCIPAL' }] },
      { type: 'BIRTH', date_text: '1764', participants: [{ personId: 3, role: 'PRINCIPAL' }] },
    ]);
    graph.ancestors.mockResolvedValue([
      { id: 2, given_names: 'Pierre', family_name: 'Dupont', sex: 'M', generation: 1, viaId: 1 },
      { id: 3, given_names: 'Anne', family_name: 'Morel', sex: 'F', generation: 1, viaId: 1 },
      { id: 4, given_names: 'Jacques', family_name: 'Dupont', sex: 'M', generation: 2, viaId: 2 },
    ]);

    renderWithProviders(<App />);
    await waitFor(() => expect(screen.getByText('1 personne(s)')).toBeInTheDocument());
    fireEvent.click(await screen.findByRole('button', { name: 'Ascendant' }));

    expect(await screen.findByText('vers 1760 – 1822')).toBeInTheDocument();
    expect(screen.getByText('° 1764')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Replier les parents de Pierre Dupont' }));
    expect(screen.queryByText('Jacques Dupont')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tout déplier' }));
    expect(screen.getByText('Jacques Dupont')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Branche'), { target: { value: 'maternal' } });
    expect(screen.queryByText('Pierre Dupont')).not.toBeInTheDocument();
    expect(screen.getByText('Anne Morel')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Branche'), { target: { value: 'all' } });
    fireEvent.change(screen.getByLabelText('Née à partir de l’année'), {
      target: { value: '1762' },
    });
    expect(screen.getByText('Pierre Dupont').closest('button')).toHaveClass('tree-node--dimmed');
    expect(screen.getByText('Anne Morel').closest('button')).not.toHaveClass('tree-node--dimmed');
  });
  it('restaure une sauvegarde SQLite en mode fichier et exporte une copie chiffrée', async () => {
    persons.list.mockResolvedValue([]);
    accounts.login.mockResolvedValue({ token: 'tok-9', account: { id: 1, name: 'Alice' } });
    backups.list.mockResolvedValue([
      {
        filename: 'geneoapp-sqlite-a.sqlite',
        kind: 'sqlite',
        label: 'auto:lancement',
        createdAt: '2026-09-23T08:00:00.000Z',
        sizeBytes: 4096,
      },
    ]);
    backups.restore.mockResolvedValue({ restored: true, restartRequired: true });
    backups.exportEncrypted.mockResolvedValue({ filename: 'x.gnapenc', contentBase64: 'AAAA' });
    trash.list.mockResolvedValue([]);
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    renderWithProviders(<App />);
    await waitFor(() =>
      expect(screen.getByText(/Aucune personne enregistrée/)).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sauvegardes' }));
    fireEvent.change(screen.getByLabelText('Profil local'), { target: { value: 'Alice' } });
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));

    expect(await screen.findByText(/Automatique · lancement/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Restaurer' }));
    await waitFor(() =>
      expect(backups.restore).toHaveBeenCalledWith('geneoapp-sqlite-a.sqlite', 'sqlite', 'tok-9'),
    );
    expect(await screen.findByText(/redémarrez GeneoApp/)).toBeInTheDocument();

    const exportButton = screen.getByRole('button', { name: /Exporter chiffrée/ });
    expect(exportButton).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Phrase secrète (12 caractères minimum)'), {
      target: { value: 'une phrase assez longue' },
    });
    fireEvent.click(exportButton);
    await waitFor(() =>
      expect(backups.exportEncrypted).toHaveBeenCalledWith(
        'geneoapp-sqlite-a.sqlite',
        'une phrase assez longue',
        'tok-9',
      ),
    );
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
    vi.unstubAllGlobals();
  });
  it('configure la copie miroir des sauvegardes sur une clé USB', async () => {
    persons.list.mockResolvedValue([]);
    accounts.login.mockResolvedValue({ token: 'tok-5', account: { id: 1, name: 'Alice' } });
    backups.list.mockResolvedValue([]);
    trash.list.mockResolvedValue([]);
    const base = {
      activeDataDir: '/Users/alice/GeneoApp',
      dataDir: null,
      mirrorDir: null,
      mirrorAvailable: false,
      restartRequired: false,
    };
    storage.status.mockResolvedValue(base);
    storage.setMirror.mockResolvedValue({
      ...base,
      mirrorDir: '/Volumes/CLE/GeneoApp',
      mirrorAvailable: true,
    });

    renderWithProviders(<App />);
    await waitFor(() =>
      expect(screen.getByText(/Aucune personne enregistrée/)).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sauvegardes' }));
    fireEvent.change(screen.getByLabelText('Profil local'), { target: { value: 'Alice' } });
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));

    fireEvent.change(await screen.findByLabelText(/Copie miroir des sauvegardes/), {
      target: { value: '/Volumes/CLE/GeneoApp' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le miroir' }));
    await waitFor(() =>
      expect(storage.setMirror).toHaveBeenCalledWith('/Volumes/CLE/GeneoApp', 'tok-5'),
    );
    expect(await screen.findByText('Miroir branché et accessible')).toBeInTheDocument();
  });
  it('compare deux personnes et distingue dates compatibles et différences nettes', async () => {
    persons.list.mockResolvedValue([
      { id: 1, given_names: 'Jean', family_name: 'Dupont', sex: 'M' },
      { id: 2, given_names: 'Jean', family_name: 'DUPONT', sex: 'M' },
    ]);
    graph.relations.mockResolvedValue({
      person: { id: 1 },
      parents: [{ id: 9, given_names: 'Pierre', family_name: 'Dupont' }],
      children: [],
      siblings: [],
      spouses: [],
    });
    events.listAll.mockResolvedValue([
      { type: 'BIRTH', date_text: 'vers 1760', participants: [{ personId: 1, role: 'PRINCIPAL' }] },
      { type: 'BIRTH', date_text: '1761', participants: [{ personId: 2, role: 'PRINCIPAL' }] },
    ]);

    renderWithProviders(<App />);
    await waitFor(() => expect(screen.getByText('2 personne(s)')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Comparaison' }));
    fireEvent.change(screen.getByLabelText('Seconde personne'), { target: { value: '2' } });

    expect(await screen.findByText(/Aucune contradiction/)).toBeInTheDocument();
    const birthRow = screen.getByRole('rowheader', { name: 'Naissance' }).closest('tr');
    expect(within(birthRow).getByText('Compatible')).toBeInTheDocument();
    const nameRow = screen.getByRole('rowheader', { name: 'Nom' }).closest('tr');
    expect(within(nameRow).getByText('Identique')).toBeInTheDocument();
  });
  it('filtre par nom approchant, lieu et période puis ouvre la fiche trouvée', async () => {
    persons.list.mockResolvedValue([{ id: 5, given_names: 'Jeanne', family_name: 'Dupond' }]);
    graph.relations.mockResolvedValue({
      person: { id: 5 },
      parents: [],
      children: [],
      siblings: [],
      spouses: [],
    });
    advancedSearch.mockResolvedValue({
      total: 1,
      results: [
        {
          person: { id: 5, given_names: 'Jeanne', family_name: 'Dupond' },
          score: 0.83,
          matchedEvents: [{ id: 1, type: 'BIRTH', dateText: '3 MAR 1850', place: 'Rouen' }],
        },
      ],
    });

    renderWithProviders(<App />);
    await waitFor(() => expect(screen.getByText('1 personne(s)')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Recherche' }));
    const form = screen.getByRole('heading', { name: 'Filtres avancés' }).parentElement;
    fireEvent.change(within(form).getByLabelText('Nom'), { target: { value: 'Dupont' } });
    fireEvent.change(within(form).getByLabelText('Lieu'), { target: { value: 'Rouen' } });
    fireEvent.change(within(form).getByLabelText('Année de début'), { target: { value: '1840' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Filtrer' }));

    await waitFor(() =>
      expect(advancedSearch).toHaveBeenCalledWith({
        familyName: 'Dupont',
        place: 'Rouen',
        yearFrom: '1840',
        fuzzy: true,
      }),
    );
    expect(await within(form).findByText('proximité 83 %')).toBeInTheDocument();
    expect(within(form).getByText('Naissance 3 mars 1850 · Rouen')).toBeInTheDocument();
    fireEvent.click(within(form).getByRole('button', { name: 'Jeanne Dupond' }));
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Identité' })).toBeInTheDocument());
  });
  it('affiche la qualité des données de la personne sélectionnée', async () => {
    persons.list.mockResolvedValue([{ id: 1, given_names: 'Jean', family_name: 'Dupont' }]);
    graph.relations.mockResolvedValue({
      person: { id: 1 },
      parents: [],
      children: [],
      siblings: [],
      spouses: [],
    });
    quality.mockResolvedValue({
      totals: { facts: 3, sourced: 1, unsourced: 2 },
      confidence: { HIGH: 1, MEDIUM: 0, LOW: 0 },
      facts: [
        { kind: 'IDENTITY', sourced: false },
        { kind: 'EVENT', type: 'BIRTH', sourced: true, bestConfidence: 'HIGH' },
        { kind: 'EVENT', type: 'DEATH', sourced: false },
      ],
      issues: [{ code: 'BIRTH_AFTER_DEATH', severity: 'CERTAIN' }],
      score: 1,
    });

    renderWithProviders(<App />);
    await waitFor(() => expect(quality).toHaveBeenCalledWith(1));
    expect(await screen.findByText('1 / 3')).toBeInTheDocument();
    expect(screen.getByText(/2 fait\(s\) sans source : identité, décès/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Qualité : 1 sur 4' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'examiner' }));
    expect(screen.getByRole('button', { name: 'Cohérence' })).toHaveClass('is-active');
  });
});
