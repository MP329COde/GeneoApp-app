import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen, waitFor } from '../test/test-utils.jsx';
import { QuickSearch } from './QuickSearch.jsx';
import { QualityMeter } from './QualityCard.jsx';
import { SiteSearch } from './SiteSearch.jsx';
import { IndexingPanel } from './IndexingPanel.jsx';

// Chaque écran est rendu dans les deux langues : le français reste le rendu
// historique, l'anglais ne doit laisser aucun texte français visible.
const indexingClient = {
  indexing: {
    status: vi.fn().mockResolvedValue({
      running: false,
      settings: { networkAllowed: false, scheduleEnabled: false, scheduleHour: 3 },
      sources: [],
      runs: [],
      progress: null,
      stats: { documents: 0, byStatus: {} },
      presets: [],
    }),
  },
};

const SCREENS = [
  {
    name: 'QuickSearch',
    render: () => <QuickSearch persons={[]} lifespans={{}} onPick={() => {}} />,
    check: (locale) =>
      expect(
        screen.getByRole('combobox', {
          name:
            locale === 'fr' ? 'Rechercher une personne (Ctrl+K)' : 'Search for a person (Ctrl+K)',
        }),
      ).toHaveAttribute(
        'placeholder',
        locale === 'fr' ? 'Rechercher une personne…' : 'Search for a person…',
      ),
  },
  {
    name: 'QualityMeter',
    render: () => <QualityMeter score={3} />,
    check: (locale) =>
      expect(screen.getByRole('img')).toHaveAttribute(
        'aria-label',
        locale === 'fr' ? 'Qualité des données : 3 sur 4' : 'Data quality: 3 out of 4',
      ),
  },
  {
    name: 'SiteSearch',
    render: () => <SiteSearch person={null} lifespan={null} />,
    check: (locale) =>
      expect(
        screen.getByRole('heading', {
          name: locale === 'fr' ? 'Rechercher sur plusieurs sites' : 'Search on several sites',
        }),
      ).toBeInTheDocument(),
  },
  {
    name: 'IndexingPanel',
    render: () => <IndexingPanel client={indexingClient} />,
    check: async (locale) =>
      expect(
        await screen.findByRole('heading', {
          name: locale === 'fr' ? 'Documents indexés' : 'Indexed documents',
        }),
      ).toBeInTheDocument(),
  },
];

describe.each(SCREENS)('$name : traduction FR/EN', ({ render, check }) => {
  beforeEach(() => {
    localStorage.clear();
  });

  it.each(['fr', 'en'])('affiche les textes en %s', async (locale) => {
    renderWithProviders(render(), { locale });
    await waitFor(() => check(locale));
  });
});
