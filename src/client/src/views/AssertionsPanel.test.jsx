import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { renderWithProviders, screen, within } from '../test/test-utils.jsx';
import { AssertionsPanel } from './AssertionsPanel.jsx';

const assertions = {
  list: vi.fn(),
  conflicts: vi.fn(),
  create: vi.fn(),
  accept: vi.fn(),
  reject: vi.fn(),
  reopen: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
};
const sources = { list: vi.fn(), addCitation: vi.fn() };
const client = { assertions, sources };

const item = (id, value, status = 'PROPOSED') => ({
  id,
  field: 'birth_date',
  value,
  status,
  proof_level: 'UNSUPPORTED',
  reasoning: null,
  support: { citations: 1, independentSources: 1, suggestedProofLevel: 'POSSIBLE' },
});

beforeEach(() => {
  vi.clearAllMocks();
  assertions.list.mockResolvedValue([item(1, '3 mars 1815', 'ACCEPTED'), item(2, '5 mars 1815')]);
  assertions.conflicts.mockResolvedValue([{ field: 'birth_date', assertions: [] }]);
  for (const name of ['create', 'accept', 'reject', 'reopen', 'update', 'remove']) {
    assertions[name].mockResolvedValue({});
  }
  sources.list.mockResolvedValue([{ id: 7, title: 'Registre paroissial' }]);
  sources.addCitation.mockResolvedValue({ id: 1 });
});

const render = () =>
  renderWithProviders(<AssertionsPanel client={client} entityType="PERSON" entityId={4} />);

describe('AssertionsPanel', () => {
  it('signale la contradiction et affiche statut, soutien et niveau suggéré', async () => {
    render();
    expect(await screen.findByText('Contradiction à trancher')).toBeInTheDocument();
    const retenue = screen.getByTestId('assertion-1');
    expect(within(retenue).getByText('Retenue')).toBeInTheDocument();
    expect(
      within(retenue).getByText(/1 citation\(s\), 1 source\(s\) distincte\(s\)/),
    ).toBeInTheDocument();
    expect(within(retenue).getByText(/niveau suggéré : Possible/)).toBeInTheDocument();
  });

  it('retenir, écarter et rouvrir sont des actions explicites', async () => {
    const user = userEvent.setup();
    render();
    const proposed = await screen.findByTestId('assertion-2');
    await user.click(within(proposed).getByRole('button', { name: 'Retenir' }));
    expect(assertions.accept).toHaveBeenCalledWith(2);
    await user.click(within(proposed).getByRole('button', { name: 'Écarter' }));
    expect(assertions.reject).toHaveBeenCalledWith(2);
    await user.click(
      within(screen.getByTestId('assertion-1')).getByRole('button', {
        name: 'Remettre en discussion',
      }),
    );
    expect(assertions.reopen).toHaveBeenCalledWith(1);
    expect(assertions.list).toHaveBeenCalledTimes(4);
  });

  it('crée une affirmation, choisit un niveau de preuve et cite une source', async () => {
    const user = userEvent.setup();
    render();
    await screen.findByTestId('assertion-1');
    await user.type(screen.getByLabelText('Valeur affirmée'), ' 4 mars 1815 ');
    await user.click(screen.getByRole('button', { name: 'Ajouter l’affirmation' }));
    expect(assertions.create).toHaveBeenCalledWith({
      entityType: 'PERSON',
      entityId: 4,
      field: 'birth_date',
      value: '4 mars 1815',
    });

    const proposed = await screen.findByTestId('assertion-2');
    await user.selectOptions(within(proposed).getByLabelText('Niveau de preuve'), 'PROBABLE');
    expect(assertions.update).toHaveBeenCalledWith(2, { proofLevel: 'PROBABLE' });

    await user.click(within(proposed).getByRole('button', { name: 'Citer une source' }));
    await user.selectOptions(await within(proposed).findByLabelText('Source'), '7');
    await user.click(within(proposed).getByRole('button', { name: 'Ajouter la citation' }));
    expect(sources.addCitation).toHaveBeenCalledWith({
      sourceId: 7,
      entityType: 'ASSERTION',
      entityId: 2,
      evidenceType: 'DIRECT',
      informationQuality: 'PRIMARY',
    });
  });

  it('affiche l’erreur de l’API et reste utilisable', async () => {
    assertions.accept.mockRejectedValue(new Error('Refusé'));
    const user = userEvent.setup();
    render();
    await user.click(
      within(await screen.findByTestId('assertion-2')).getByRole('button', { name: 'Retenir' }),
    );
    expect(await screen.findByText('Refusé')).toBeInTheDocument();
  });

  it('est accessible (axe)', async () => {
    const { container } = render();
    await screen.findByTestId('assertion-1');
    expect(await axe(container)).toHaveNoViolations();
  });
});
