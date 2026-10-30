import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { renderWithProviders, screen } from '../test/test-utils.jsx';
import { MediaLinksPanel, MediaUrlForm } from './MediaLinksPanel.jsx';

const media = {
  listLinks: vi.fn(),
  addLink: vi.fn(),
  removeLink: vi.fn(),
  addUrl: vi.fn(),
};
const client = { media };
const persons = [{ id: 2, given_names: 'Ada', family_name: 'Dupont' }];

beforeEach(() => {
  vi.clearAllMocks();
  media.listLinks.mockResolvedValue([
    { id: 8, entityType: 'EVENT', entityId: 12, role: 'SUBJECT' },
  ]);
  media.addLink.mockResolvedValue({});
  media.removeLink.mockResolvedValue(undefined);
  media.addUrl.mockResolvedValue({});
});

describe('MediaLinksPanel', () => {
  it('liste, ajoute et retire un lien', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(
      <MediaLinksPanel client={client} mediaId={3} persons={persons} />,
    );
    expect(await screen.findByText(/Événement #12/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Personne'), '2');
    await user.selectOptions(screen.getByLabelText('Rôle'), 'AUTHOR');
    await user.click(screen.getByRole('button', { name: 'Ajouter le lien' }));
    expect(media.addLink).toHaveBeenCalledWith(3, {
      entityType: 'PERSON',
      entityId: 2,
      role: 'AUTHOR',
    });
    await user.click(screen.getByRole('button', { name: /Retirer le lien vers Événement #12/ }));
    expect(media.removeLink).toHaveBeenCalledWith(3, 8);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('MediaUrlForm', () => {
  it('envoie le titre et l’adresse, et affiche une erreur du serveur', async () => {
    const user = userEvent.setup();
    const onAdded = vi.fn();
    renderWithProviders(<MediaUrlForm client={client} sourceId={4} onAdded={onAdded} />);
    await user.type(screen.getByLabelText('Titre du lien'), 'Archives');
    await user.type(screen.getByLabelText(/Adresse web/), 'https://archives.example/acte');
    await user.click(screen.getByRole('button', { name: 'Ajouter le lien web' }));
    expect(media.addUrl).toHaveBeenCalledWith({
      title: 'Archives',
      url: 'https://archives.example/acte',
      sourceId: 4,
    });
    expect(onAdded).toHaveBeenCalled();
    media.addUrl.mockRejectedValue(new Error('url est invalide'));
    await user.type(screen.getByLabelText('Titre du lien'), 'x');
    await user.type(screen.getByLabelText(/Adresse web/), 'https://a.example');
    await user.click(screen.getByRole('button', { name: 'Ajouter le lien web' }));
    expect(await screen.findByText(/url est invalide/)).toBeInTheDocument();
  });
});
