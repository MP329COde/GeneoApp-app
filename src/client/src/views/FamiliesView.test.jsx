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
  { id: 1, given_names: 'Ada', family_name: 'Dupont' },
  { id: 2, given_names: 'Alan', family_name: 'Turing' },
];

async function openRemoveDialog(user) {
  await user.click(
    await screen.findByRole('button', { name: /Actions pour l’union avec Alan Turing/ }),
  );
  await user.click(screen.getByRole('menuitem', { name: 'Dissoudre / supprimer' }));
}

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

    await openRemoveDialog(user);

    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toBeInTheDocument();
    expect(removeUnion).not.toHaveBeenCalled();
  });

  it('dissout l’union après confirmation explicite', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FamiliesPanel persons={persons} selected={persons[0]} />);

    await openRemoveDialog(user);
    const dialog = screen.getByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Dissoudre / supprimer' }));

    expect(removeUnion).toHaveBeenCalledWith(10);
    expect(await screen.findByText('Union dissoute.')).toBeInTheDocument();
  });

  it('rend le focus au menu « … » quand on annule', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FamiliesPanel persons={persons} selected={persons[0]} />);

    await openRemoveDialog(user);
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Annuler' }),
    );

    expect(
      screen.getByRole('button', { name: /Actions pour l’union avec Alan Turing/ }),
    ).toHaveFocus();
  });

  it('n’efface rien si l’utilisateur annule', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FamiliesPanel persons={persons} selected={persons[0]} />);

    await openRemoveDialog(user);
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

describe('FamillesPanel : sections et ajouts en ligne', () => {
  beforeEach(() => {
    listForPerson.mockResolvedValue([]);
    listParentsOf.mockResolvedValue([]);
    listChildrenOf.mockResolvedValue([]);
  });

  it('affiche trois sections avec un état vide soigné', async () => {
    renderWithProviders(<FamiliesPanel persons={persons} selected={persons[0]} />);
    expect(await screen.findByText(/Aucune union enregistrée/)).toBeInTheDocument();
    expect(screen.getByText('Aucun parent enregistré.')).toBeInTheDocument();
    expect(screen.getByText('Aucun enfant enregistré.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Parents' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Unions' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Enfants' })).toBeInTheDocument();
  });

  it('déplie le formulaire, cherche une personne au clavier et ajoute l’enfant', async () => {
    const user = userEvent.setup();
    const { client } = await import('../api/app-client.js');
    client.parentages.create = vi.fn().mockResolvedValue({ id: 5 });
    renderWithProviders(<FamiliesPanel persons={persons} selected={persons[0]} />);

    const toggle = await screen.findByRole('button', { name: 'Ajouter un enfant' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    const combo = screen.getByRole('combobox', { name: 'Enfant' });
    expect(combo).toHaveFocus();
    await user.type(combo, 'tur');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    await user.keyboard('{Enter}');
    await user.click(screen.getByRole('button', { name: 'Ajouter l’enfant' }));

    expect(client.parentages.create).toHaveBeenCalledWith({
      childId: 2,
      parentId: 1,
      parentRole: 'PARENT',
    });
    expect(await screen.findByText('Enfant ajouté : Alan Turing.')).toBeInTheDocument();
    expect(toggle).toHaveFocus();
  });

  it('Échap referme le formulaire et rend le focus au bouton', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FamiliesPanel persons={persons} selected={persons[0]} />);
    const toggle = await screen.findByRole('button', { name: 'Ajouter un parent' });
    await user.click(toggle);
    // Premier Échap : referme la liste de suggestions ; le second, le formulaire.
    await user.keyboard('{Escape}{Escape}');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveFocus();
  });
});
