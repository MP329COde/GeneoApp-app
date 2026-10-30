import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { renderWithProviders, screen, waitFor } from '../test/test-utils.jsx';
import { AiAssistantPanel } from './AiAssistantPanel.jsx';

const ai = { status: vi.fn(), updateConfig: vi.fn(), suggest: vi.fn() };
const assertions = { create: vi.fn() };
const research = { list: vi.fn(), addHypothesis: vi.fn(), addTask: vi.fn() };
const notes = { listAll: vi.fn() };
const sources = { list: vi.fn() };
const persons = { list: vi.fn() };
const client = { ai, assertions, research, notes, sources, persons };

const status = (overrides = {}) => ({
  state: 'READY',
  enabled: true,
  provider: 'OLLAMA',
  endpoint: 'http://127.0.0.1:11434',
  model: '',
  models: ['llama3:8b'],
  prompts: [{ id: 'analyze-note', version: 1, description: 'x' }],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  ai.status.mockResolvedValue(status());
  ai.updateConfig.mockResolvedValue(status());
  notes.listAll.mockResolvedValue([
    { id: 4, title: 'Naissance de Pierre', entity_type: 'PERSON', entity_id: 9 },
  ]);
  sources.list.mockResolvedValue([]);
  persons.list.mockResolvedValue({ items: [] });
  research.list.mockResolvedValue([{ id: 3, title: 'Acte de mariage' }]);
  assertions.create.mockResolvedValue({});
  research.addTask.mockResolvedValue({});
});

describe('AiAssistantPanel', () => {
  it('désactivée : état clair, réglages visibles, aucun formulaire de suggestion', async () => {
    ai.status.mockResolvedValue(status({ state: 'DISABLED', enabled: false, models: [] }));
    const { container } = renderWithProviders(<AiAssistantPanel client={client} />);
    expect(await screen.findByText('Désactivée', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByLabelText('Activer l’IA locale')).not.toBeChecked();
    expect(screen.queryByText('Demander des suggestions')).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('serveur injoignable : affiche la raison', async () => {
    ai.status.mockResolvedValue(
      status({ state: 'UNREACHABLE', models: [], reason: 'Le serveur IA locale est injoignable' }),
    );
    renderWithProviders(<AiAssistantPanel client={client} />);
    expect(await screen.findByText(/Le serveur IA locale est injoignable/)).toBeInTheDocument();
  });

  it('enregistre les réglages saisis', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AiAssistantPanel client={client} />);
    await screen.findByText('Prête');
    await user.selectOptions(screen.getByLabelText('Modèle'), 'llama3:8b');
    await user.click(screen.getByRole('button', { name: 'Enregistrer les réglages' }));
    expect(ai.updateConfig).toHaveBeenCalledWith({
      enabled: true,
      provider: 'OLLAMA',
      endpoint: 'http://127.0.0.1:11434',
      model: 'llama3:8b',
    });
  });

  it('suggestions : rien n’est enregistré sans clic, extrait non fondé signalé', async () => {
    ai.suggest.mockResolvedValue({
      promptId: 'analyze-note@1',
      model: 'llama3:8b',
      requiresHumanReview: true,
      suggestions: [
        {
          kind: 'FACT',
          field: 'birth_date',
          value: '3 mars 1815',
          text: 'Naissance',
          rationale: '',
          quote: 'né le 3 mars 1815',
          grounded: true,
        },
        {
          kind: 'FACT',
          field: 'death_date',
          value: '1890',
          text: 'Décès',
          rationale: '',
          quote: 'mort en 1890',
          grounded: false,
        },
      ],
    });
    const user = userEvent.setup();
    const { container } = renderWithProviders(<AiAssistantPanel client={client} />);
    await screen.findByText('Demander des suggestions');
    await waitFor(() => expect(notes.listAll).toHaveBeenCalled());
    await user.selectOptions(screen.getByLabelText('Note'), '4');
    await user.click(screen.getByRole('button', { name: 'Analyser' }));
    expect(await screen.findByText('Extrait retrouvé dans le texte')).toBeInTheDocument();
    expect(screen.getByText(/ne pas croire sans vérification/)).toBeInTheDocument();
    expect(assertions.create).not.toHaveBeenCalled();

    await user.click(screen.getAllByRole('button', { name: 'Proposer comme affirmation' })[0]);
    expect(assertions.create).toHaveBeenCalledTimes(1);
    const payload = assertions.create.mock.calls[0][0];
    expect(payload).toMatchObject({
      entityType: 'PERSON',
      entityId: 9,
      field: 'birth_date',
      value: '3 mars 1815',
    });
    expect(payload.reasoning).toContain('analyze-note@1');
    expect(payload.reasoning).toContain('à vérifier');
    expect(payload).not.toHaveProperty('status');
    expect(await screen.findByText('Enregistré (à relire).')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ignorer' }));
    expect(await screen.findByText('Suggestion ignorée.')).toBeInTheDocument();
    expect(assertions.create).toHaveBeenCalledTimes(1);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('recherche : une tâche suggérée devient une tâche seulement après le clic', async () => {
    ai.suggest.mockResolvedValue({
      promptId: 'suggest-research@1',
      model: 'm',
      suggestions: [
        {
          kind: 'TASK',
          text: 'Consulter le registre de 1815',
          rationale: '',
          quote: null,
          grounded: false,
        },
      ],
    });
    const user = userEvent.setup();
    renderWithProviders(<AiAssistantPanel client={client} />);
    await screen.findByText('Demander des suggestions');
    await user.selectOptions(screen.getByLabelText('Analyse'), 'suggest-research');
    await waitFor(() => expect(research.list).toHaveBeenCalled());
    await user.selectOptions(await screen.findByLabelText('Recherche'), '3');
    await user.click(screen.getByRole('button', { name: 'Analyser' }));
    await screen.findByText('Consulter le registre de 1815');
    expect(research.addTask).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Ajouter comme tâche' }));
    expect(research.addTask).toHaveBeenCalledWith(3, {
      title: 'Consulter le registre de 1815',
      priority: 'MEDIUM',
    });
  });

  it('affiche l’erreur du serveur', async () => {
    ai.suggest.mockRejectedValue(new Error('La réponse du modèle local est inexploitable'));
    const user = userEvent.setup();
    renderWithProviders(<AiAssistantPanel client={client} />);
    await screen.findByText('Demander des suggestions');
    await waitFor(() => expect(notes.listAll).toHaveBeenCalled());
    await user.selectOptions(screen.getByLabelText('Note'), '4');
    await user.click(screen.getByRole('button', { name: 'Analyser' }));
    expect(await screen.findByText(/inexploitable/)).toBeInTheDocument();
  });
});
