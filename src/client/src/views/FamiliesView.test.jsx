import { describe, expect, it, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, screen, within } from '../test/test-utils.jsx';
import { FamiliesPanel } from './FamiliesView.jsx';

const listForPerson = vi.fn();
const removeUnion = vi.fn();
const listParentsOf = vi.fn();
const listChildrenOf = vi.fn();

vi.mock('../api/app-client.js', () => ({
  client: {
    unions: {
      listForPerson: (...args) => listForPerson(...args),
      remove: (...args) => removeUnion(...args),
    },
    parentages: {
      listParentsOf: (...args) => listParentsOf(...args),
      listChildrenOf: (...args) => listChildrenOf(...args),
    },
  },
}));

const persons = [
  { id: 1, givenNames: 'Ada', familyName: 'Dupont' },
  { id: 2, givenNames: 'Alan', familyName: 'Turing' },
];

describe('FamillesPanel : confirmation de suppression', () => {
  beforeEach(() => {
    listForPerson.mockResolvedValue([{ id: 10, type: 'MARRIAGE', partnerIds: [1, 2] }]);
    listParentsOf.mockResolvedValue([]);
    listChildrenOf.mockResolvedValue([]);
    removeUnion.mockResolvedValue(undefined);
  });

  it('demande confirmation avant de dissoudre une union', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FamiliesPanel persons={persons} selected={persons[0]} />);

    await user.click(await screen.findByRole('button', { name: 'Dissoudre / supprimer' }));

    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toBeInTheDocument();
    expect(removeUnion).not.toHaveBeenCalled();
  });

  it('dissout l’union après confirmation explicite', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FamiliesPanel persons={persons} selected={persons[0]} />);

    await user.click(await screen.findByRole('button', { name: 'Dissoudre / supprimer' }));
    const dialog = screen.getByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Dissoudre / supprimer' }));

    expect(removeUnion).toHaveBeenCalledWith(10);
  });

  it('n’efface rien si l’utilisateur annule', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FamiliesPanel persons={persons} selected={persons[0]} />);

    await user.click(await screen.findByRole('button', { name: 'Dissoudre / supprimer' }));
    const dialog = screen.getByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Annuler' }));

    expect(removeUnion).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});

describe('FamillesPanel : fiche famille', () => {
  it('affiche partenaires, enfants et nature du lien', async () => {
    const family = vi.fn().mockResolvedValue({
      union: { id: 10 },
      partners: [{ id: 1, given_names: 'Ada', family_name: 'Dupont' }],
      children: [
        {
          id: 3,
          given_names: 'Eve',
          family_name: 'Dupont',
          links: [{ parentId: 1, parentRole: 'MOTHER', linkType: 'ADOPTIVE' }],
        },
      ],
      startEvent: null,
      endEvent: null,
    });
    const { client } = await import('../api/app-client.js');
    client.unions.family = family;
    listForPerson.mockResolvedValue([{ id: 10, type: 'MARRIAGE', partnerIds: [1, 2] }]);
    listParentsOf.mockResolvedValue([]);
    listChildrenOf.mockResolvedValue([]);
    const user = userEvent.setup();
    renderWithProviders(<FamiliesPanel persons={persons} selected={persons[0]} />);
    await user.click(await screen.findByRole('button', { name: /fiche famille/i }));
    expect(await screen.findByText(/Adoptif/)).toBeInTheDocument();
    expect(family).toHaveBeenCalledWith(10);
  });
});
