import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { renderWithProviders, screen } from '../test/test-utils.jsx';
import { IdentifiersPanel } from './IdentifiersPanel.jsx';

const persons = {
  listIdentifiers: vi.fn(),
  addIdentifier: vi.fn(),
  removeIdentifier: vi.fn(),
};
const client = { persons };

beforeEach(() => {
  vi.clearAllMocks();
  persons.listIdentifiers.mockResolvedValue([{ id: 3, scheme: 'WIKIDATA', value: 'Q42' }]);
  persons.addIdentifier.mockResolvedValue({});
  persons.removeIdentifier.mockResolvedValue(true);
});

describe('IdentifiersPanel', () => {
  it('liste, ajoute et retire un identifiant', async () => {
    const user = userEvent.setup();
    renderWithProviders(<IdentifiersPanel client={client} personId={5} />);
    expect(await screen.findByText('Q42')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Référentiel/), 'geneanet');
    await user.type(screen.getByLabelText('Identifiant'), 'abc1');
    await user.click(screen.getByRole('button', { name: /Ajouter l’identifiant/ }));
    expect(persons.addIdentifier).toHaveBeenCalledWith(5, { scheme: 'geneanet', value: 'abc1' });
    await user.click(screen.getByRole('button', { name: /Retirer WIKIDATA Q42/ }));
    expect(persons.removeIdentifier).toHaveBeenCalledWith(5, 3);
  });

  it('affiche l’erreur du serveur et reste accessible', async () => {
    persons.addIdentifier.mockRejectedValue(new Error('Identifiant déjà utilisé'));
    const user = userEvent.setup();
    const { container } = renderWithProviders(<IdentifiersPanel client={client} personId={5} />);
    await screen.findByText('Q42');
    await user.type(screen.getByLabelText(/Référentiel/), 'x');
    await user.type(screen.getByLabelText('Identifiant'), 'y');
    await user.click(screen.getByRole('button', { name: /Ajouter l’identifiant/ }));
    expect(await screen.findByText(/déjà utilisé/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});
