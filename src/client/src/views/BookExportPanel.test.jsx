import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { renderWithProviders, screen } from '../test/test-utils.jsx';

const mocks = vi.hoisted(() => ({ book: vi.fn() }));

vi.mock('../api/app-client.js', () => ({
  client: { reports: { book: mocks.book } },
}));

import { BookExportPanel } from './BookExportPanel.jsx';

// « %PDF-1.4 » en base64.
const PDF_BASE64 = btoa('%PDF-1.4\n%%EOF');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.book.mockResolvedValue({
    filename: 'livre.pdf',
    contentBase64: PDF_BASE64,
    summary: { persons: 2, sources: 1, hidden: 1 },
  });
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:livre');
  globalThis.URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

const persons = [
  { id: 1, given_names: 'Jean', family_name: 'Durand' },
  { id: 2, given_names: 'Léa', family_name: 'Durand' },
];

describe('BookExportPanel', () => {
  it('masque les vivants par défaut et envoie les choix à l’API', async () => {
    const user = userEvent.setup();
    renderWithProviders(<BookExportPanel selected={{ id: 2 }} persons={persons} />);
    expect(screen.getByRole('option', { name: 'Jean Durand' })).toBeInTheDocument();

    const living = screen.getByLabelText(/Inclure les personnes vivantes/);
    expect(living).not.toBeChecked();
    expect(screen.getByLabelText('Personne racine')).toHaveValue('2');

    await user.selectOptions(screen.getByLabelText('Sens'), 'ancestors');
    await user.clear(screen.getByLabelText('Générations'));
    await user.type(screen.getByLabelText('Générations'), '3');
    await user.click(screen.getByRole('button', { name: 'Exporter un livre PDF' }));

    expect(mocks.book).toHaveBeenCalledWith({
      rootPersonId: 2,
      direction: 'ancestors',
      generations: 3,
      includeLiving: false,
      locale: 'fr',
    });
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    const blob = URL.createObjectURL.mock.calls[0][0];
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBe('%PDF-1.4\n%%EOF'.length);
    expect(await screen.findByRole('status')).toHaveTextContent('2 fiche(s), 1 source(s)');
  });

  it('exporte l’arbre entier et peut inclure les vivants sur demande', async () => {
    const user = userEvent.setup();
    renderWithProviders(<BookExportPanel selected={null} persons={persons} />, { locale: 'en' });
    screen.getByRole('option', { name: 'Jean Durand' });
    expect(screen.getByLabelText('Root person')).toHaveValue('');
    await user.click(screen.getByLabelText(/Include living or private people/));
    expect(screen.getByText(/Warning: the book will contain/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Export a PDF book' }));
    expect(mocks.book).toHaveBeenCalledWith({ includeLiving: true, locale: 'en' });
  });

  it('affiche l’erreur et reste accessible', async () => {
    mocks.book.mockRejectedValue(new Error('Personne racine introuvable'));
    const user = userEvent.setup();
    const { container } = renderWithProviders(
      <BookExportPanel selected={null} persons={persons} />,
    );
    screen.getByRole('option', { name: 'Jean Durand' });
    await user.click(screen.getByRole('button', { name: 'Exporter un livre PDF' }));
    expect(await screen.findByText(/introuvable/)).toBeInTheDocument();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(await axe(container)).toHaveNoViolations();
  });
});
