import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, waitFor } from '../test/test-utils.jsx';
import { PhotoViewer } from './PhotoViewer.jsx';

const photo = {
  id: 1,
  original_filename: 'portrait.jpg',
  mime_type: 'image/jpeg',
  size_bytes: 2048,
  taken_date: null,
  place_id: null,
  description: null,
  tags: null,
  regions: [],
};

function fakeClient() {
  return {
    media: {
      photo: vi.fn().mockResolvedValue(photo),
      download: vi.fn().mockResolvedValue({ blob: new Blob(['x']) }),
    },
    places: {
      list: vi.fn().mockResolvedValue([]),
    },
  };
}

describe('PhotoViewer : taille de fichier traduite', () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:photo');
    URL.revokeObjectURL = vi.fn();
  });

  it('affiche la taille en kilo-octets en français', async () => {
    renderWithProviders(
      <PhotoViewer client={fakeClient()} mediaId={1} persons={[]} onClose={() => {}} />,
      { locale: 'fr' },
    );

    await waitFor(() => expect(screen.getByText(/2 Ko/)).toBeInTheDocument());
  });

  it('affiche la taille en kilobytes en anglais', async () => {
    renderWithProviders(
      <PhotoViewer client={fakeClient()} mediaId={1} persons={[]} onClose={() => {}} />,
      { locale: 'en' },
    );

    await waitFor(() => expect(screen.getByText(/2 KB/)).toBeInTheDocument());
    expect(screen.queryByText(/2 Ko/)).not.toBeInTheDocument();
  });
});
