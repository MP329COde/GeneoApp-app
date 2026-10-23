import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen, waitFor } from '../test/test-utils.jsx';
import { IndexingPanel } from './IndexingPanel.jsx';

function fakeClient() {
  return {
    indexing: {
      status: vi.fn().mockResolvedValue({
        running: false,
        settings: { networkAllowed: true, scheduleEnabled: false, scheduleHour: 3 },
        sources: [],
        runs: [],
        progress: null,
        stats: { documents: 0, byStatus: {} },
        presets: [],
      }),
      searchPage: vi.fn().mockResolvedValue({ hits: [], total: 0 }),
    },
    media: {
      download: vi.fn().mockResolvedValue({ filename: 'scan.pdf', blob: new Blob(['x']) }),
    },
  };
}

describe('IndexingPanel : exemple de chemin traduit', () => {
  it('propose un exemple de dossier en français', async () => {
    renderWithProviders(<IndexingPanel client={fakeClient()} />, { locale: 'fr' });

    await waitFor(() =>
      expect(screen.getByPlaceholderText('/Users/moi/Généalogie/scans')).toBeInTheDocument(),
    );
  });

  it('propose un exemple de dossier en anglais', async () => {
    renderWithProviders(<IndexingPanel client={fakeClient()} />, { locale: 'en' });

    await waitFor(() =>
      expect(screen.getByPlaceholderText('/Users/me/Genealogy/scans')).toBeInTheDocument(),
    );
    expect(screen.queryByPlaceholderText('/Users/moi/Généalogie/scans')).not.toBeInTheDocument();
  });
});
