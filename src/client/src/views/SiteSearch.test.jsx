import { describe, expect, it, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, screen } from '../test/test-utils.jsx';

const setConnectorOptIn = vi.fn();
const connectors = vi.fn();

vi.mock('../api/app-client.js', () => ({
  client: {
    indexing: {
      connectors: (...args) => connectors(...args),
      setConnectorOptIn: (...args) => setConnectorOptIn(...args),
      estimateConnector: vi.fn().mockResolvedValue({ pages: 3, capped: false }),
      indexConnector: vi.fn().mockResolvedValue({ indexed: 2, skipped: 0, status: 'DONE' }),
    },
  },
}));

const { SiteSearch } = await import('./SiteSearch.jsx');

describe('SiteSearch : indexation locale des pages distantes', () => {
  beforeEach(() => {
    connectors.mockResolvedValue([{ id: 'geneanet', optedIn: false }]);
    setConnectorOptIn.mockResolvedValue({ optedIn: true });
  });

  it('propose l’opt-in pour chaque site indexable du catalogue', () => {
    renderWithProviders(<SiteSearch person={{ family_name: 'Dupont', given_names: 'Ada' }} />);

    // Geneanet, FamilySearch et Gallica sont indexables ; la « Recherche web »
    // ne l'est pas (aucun connecteur côté serveur).
    expect(screen.getAllByRole('checkbox', { name: /indexation locale/ })).toHaveLength(3);
  });

  it('n’accorde l’indexation qu’après un clic explicite', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SiteSearch person={{ family_name: 'Dupont', given_names: 'Ada' }} />);

    expect(setConnectorOptIn).not.toHaveBeenCalled();

    await user.click(screen.getAllByRole('checkbox', { name: /indexation locale/ })[0]);

    expect(setConnectorOptIn).toHaveBeenCalledWith('geneanet', { optedIn: true });
  });

  it('reste utilisable si le client ne connaît pas l’API des connecteurs', () => {
    connectors.mockRejectedValue(new Error('API absente'));
    renderWithProviders(<SiteSearch person={{ family_name: 'Dupont', given_names: 'Ada' }} />);

    // L'écran de recherche reste rendu, sans planter.
    expect(screen.getByRole('heading', { name: /Rechercher sur plusieurs sites/ })).toBeInTheDocument();
  });
});
