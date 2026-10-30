import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen, waitFor } from '../test/test-utils.jsx';
import userEvent from '@testing-library/user-event';
import { SiteIndexOptIn } from './site-index-opt-in.jsx';

// Le composant d'opt-in ne doit jamais contacter un site par lui-même : il
// passe par le client, qui ne parle qu'au serveur local.

function makeClient(overrides = {}) {
  return {
    indexing: {
      connectors: async () => [{ id: 'geneanet', optedIn: false, maxPages: 20 }],
      setConnectorOptIn: vi.fn(async () => ({})),
      estimateConnector: vi.fn(async () => ({ pages: 3, capped: false, reason: null })),
      indexConnector: vi.fn(async () => ({ indexed: 3 })),
      ...overrides,
    },
  };
}

describe('opt-in d’indexation locale', () => {
  it('affiche l’état de l’autorisation et permet de l’accorder', async () => {
    const client = makeClient();
    renderWithProviders(<SiteIndexOptIn site={{ id: 'geneanet' }} client={client} />);

    const checkbox = await screen.findByRole('checkbox');
    await waitFor(() => expect(checkbox).not.toBeDisabled());
    expect(checkbox).not.toBeChecked();

    await userEvent.click(checkbox);
    await waitFor(() =>
      expect(client.indexing.setConnectorOptIn).toHaveBeenCalledWith('geneanet', {
        optedIn: true,
      }),
    );
  });

  it('n’affiche rien pour un site non indexable', () => {
    const client = makeClient();
    const { container } = renderWithProviders(
      <SiteIndexOptIn site={{ id: 'web' }} client={client} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('estime le nombre de pages quand l’indexation est autorisée', async () => {
    const client = makeClient({ connectors: async () => [{ id: 'geneanet', optedIn: true }] });
    renderWithProviders(
      <SiteIndexOptIn site={{ id: 'geneanet' }} client={client} values={{ lastName: 'Dupont' }} />,
    );

    const button = await screen.findByRole('button', { name: /estimer/i });
    await userEvent.click(button);
    await waitFor(() => expect(client.indexing.estimateConnector).toHaveBeenCalled());
    const found = await screen.findAllByText(/3 pages/);
    expect(found.length).toBeGreaterThan(0);
  });

  it('explique qu’aucune page n’a été téléchargée quand robots.txt l’interdit', async () => {
    const client = makeClient({
      connectors: async () => [{ id: 'geneanet', optedIn: true }],
      estimateConnector: async () => ({ pages: 0, capped: false, reason: 'robotsDisallowed' }),
    });
    renderWithProviders(<SiteIndexOptIn site={{ id: 'geneanet' }} client={client} />);

    await userEvent.click(await screen.findByRole('button', { name: /estimer/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/robots\.txt/i);
  });

  it('invite à autoriser le site quand l’estimation est refusée', async () => {
    const client = makeClient({
      connectors: async () => [{ id: 'geneanet', optedIn: true }],
      estimateConnector: async () => {
        const error = new Error('refusé');
        error.status = 403;
        throw error;
      },
    });
    renderWithProviders(<SiteIndexOptIn site={{ id: 'geneanet' }} client={client} />);

    await userEvent.click(await screen.findByRole('button', { name: /estimer/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/autorisez/i);
  });
});
