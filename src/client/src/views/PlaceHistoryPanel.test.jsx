import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { renderWithProviders, screen } from '../test/test-utils.jsx';
import { PlaceHistoryPanel } from './PlaceHistoryPanel.jsx';

const places = {
  listNames: vi.fn(),
  listParents: vi.fn(),
  addName: vi.fn(),
  removeName: vi.fn(),
  addParent: vi.fn(),
  removeParent: vi.fn(),
  resolve: vi.fn(),
};
const client = { places };
const list = [
  { id: 1, name: 'Königsberg' },
  { id: 2, name: 'Prusse' },
];

beforeEach(() => {
  vi.clearAllMocks();
  places.listNames.mockResolvedValue([
    { id: 9, name: 'Kaliningrad', language: 'ru', validFromYear: 1946, validToYear: null },
  ]);
  places.listParents.mockResolvedValue([]);
  places.addName.mockResolvedValue({});
  places.resolve.mockResolvedValue({ fullName: 'Königsberg, Prusse' });
});

describe('PlaceHistoryPanel', () => {
  it('affiche les noms, ajoute un nom daté et résout une année', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<PlaceHistoryPanel client={client} places={list} />);
    await user.click(screen.getByRole('button', { name: /Éditer les noms/ }));
    await user.selectOptions(screen.getByLabelText('Lieu'), '1');
    expect(await screen.findByText(/Kaliningrad/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Nom'), 'Krolewiec');
    await user.type(screen.getAllByLabelText(/Valable depuis/)[0], '1300');
    await user.click(screen.getByRole('button', { name: 'Ajouter le nom' }));
    expect(places.addName).toHaveBeenCalledWith(1, {
      name: 'Krolewiec',
      validFromYear: 1300,
      validToYear: undefined,
    });
    await user.type(screen.getByLabelText('Année à consulter'), '1800');
    await user.click(screen.getByRole('button', { name: /Voir le lieu/ }));
    expect(places.resolve).toHaveBeenCalledWith(1, 1800);
    expect(await screen.findByText('Königsberg, Prusse')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});
