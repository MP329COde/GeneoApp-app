import { describe, expect, it, vi } from 'vitest';
import { axe } from 'jest-axe';
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
  duplicates: vi.fn(),
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
  remove: vi.fn(),
}));
const sources = vi.hoisted(() => ({
  create: vi.fn(),
  get: vi.fn(),
  addCitation: vi.fn(),
  listCitationsForEntity: vi.fn(),
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
});
