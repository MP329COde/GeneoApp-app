import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, waitFor } from '../test/test-utils.jsx';

const backups = [
  {
    filename: 'sauvegarde.json',
    kind: 'logical',
    label: 'Manuelle',
    sizeBytes: 2048,
    createdAt: '2026-01-02T03:04:05.000Z',
  },
];

vi.mock('../api/app-client.js', () => ({
  client: {
    backups: { list: vi.fn().mockResolvedValue(backups) },
    trash: { list: vi.fn().mockResolvedValue([]) },
  },
}));

const { BackupsPanel } = await import('./AccountsBackupsView.jsx');

const session = { token: 'jeton', account: { id: 1, email: 'a@b.fr' } };

describe('Sauvegardes : taille de fichier traduite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('affiche la taille en kilo-octets en français', async () => {
    renderWithProviders(<BackupsPanel session={session} onLogin={() => {}} />, { locale: 'fr' });

    await waitFor(() => expect(screen.getByText(/2 Ko/)).toBeInTheDocument());
  });

  it('affiche la taille en kilobytes en anglais', async () => {
    renderWithProviders(<BackupsPanel session={session} onLogin={() => {}} />, { locale: 'en' });

    await waitFor(() => expect(screen.getByText(/2 KB/)).toBeInTheDocument());
    expect(screen.queryByText(/2 Ko/)).not.toBeInTheDocument();
  });
});
