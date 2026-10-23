import { describe, expect, it } from 'vitest';
import {
  CONNECTOR_REASONS,
  DEFAULT_SITES,
  TEMPLATE_ERRORS,
  buildSearchUrl,
  buildSearchValues,
  estimateConnectorPages,
  indexConnectorPages,
  isIndexableSite,
  setConnectorOptIn,
  toConnectorReason,
  validateTemplate,
} from './search-sites.js';

describe('sites de recherche', () => {
  it('encode les valeurs et laisse vides les inconnues', () => {
    const url = buildSearchUrl('https://ex.org/?n={nom}&p={prenom}&y={annee}', {
      nom: 'Lefèvre & fils',
      prenom: 'Jean-Baptiste',
    });
    expect(url).toBe('https://ex.org/?n=Lef%C3%A8vre%20%26%20fils&p=Jean-Baptiste&y=');
  });

  it('refuse les modèles non https, les variables inconnues et les identifiants', () => {
    expect(validateTemplate('http://ex.org/{nom}')?.code).toBe(TEMPLATE_ERRORS.HTTPS_REQUIRED);
    expect(validateTemplate('javascript:alert(1)')?.code).toBe(TEMPLATE_ERRORS.HTTPS_REQUIRED);
    expect(validateTemplate('https://ex.org/{motdepasse}')).toEqual({
      code: TEMPLATE_ERRORS.UNKNOWN_VARIABLE,
      variable: 'motdepasse',
    });
    expect(validateTemplate('https://a:b@ex.org/{nom}')?.code).toBe(
      TEMPLATE_ERRORS.CREDENTIALS_FORBIDDEN,
    );
    expect(validateTemplate('https://')?.code).toBe(TEMPLATE_ERRORS.INVALID_ADDRESS);
    expect(buildSearchUrl('http://ex.org', {})).toBeNull();
  });

  it('les sites fournis par défaut sont valides', () => {
    for (const site of DEFAULT_SITES) expect(validateTemplate(site.template)).toBeNull();
  });
});

describe('indexation locale des connecteurs', () => {
  it('ne considère que les sites du catalogue serveur', () => {
    expect(isIndexableSite({ id: 'geneanet' })).toBe(true);
    expect(isIndexableSite({ id: 'web' })).toBe(false);
    expect(isIndexableSite({ id: 'inconnu' })).toBe(false);
    expect(isIndexableSite(null)).toBe(false);
  });

  it('n’envoie au serveur que les quatre variables de recherche', () => {
    expect(
      buildSearchValues({
        lastName: '  Dupont ',
        firstName: 'Jean',
        year: '1788',
        place: 'Rouen',
        extra: 'ignoré',
      }),
    ).toEqual({ nom: 'Dupont', prenom: 'Jean', annee: '1788', lieu: 'Rouen' });
  });

  it('refuse d’estimer un site non indexable, sans appel réseau', async () => {
    const client = {
      indexing: {
        estimateConnector: () => {
          throw new Error('appel');
        },
      },
    };
    const result = await estimateConnectorPages(client, { id: 'web' }, {});
    expect(result.reason).toBe(CONNECTOR_REASONS.INVALID_ADDRESS);
    expect(result.pages).toBe(0);
  });

  it('traduit la réponse d’estimation en code stable', async () => {
    const client = {
      indexing: { estimateConnector: async () => ({ pages: 4, capped: true, reason: null }) },
    };
    const result = await estimateConnectorPages(client, { id: 'geneanet' }, { lastName: 'Dupont' });
    expect(result).toEqual({ pages: 4, capped: true, reason: null });
  });

  it('active et désactive l’opt-in par identifiant de connecteur', async () => {
    const calls = [];
    const client = {
      indexing: {
        setConnectorOptIn: async (id, payload) => {
          calls.push([id, payload]);
        },
      },
    };
    await setConnectorOptIn(client, { id: 'geneanet' }, true);
    await setConnectorOptIn(client, { id: 'gallica' }, false);
    expect(calls).toEqual([
      ['geneanet', { optedIn: true }],
      ['gallica', { optedIn: false }],
    ]);
  });

  it('traduit les motifs du serveur en codes affichables', () => {
    expect(toConnectorReason('ROBOTS_DISALLOWED')).toBe(CONNECTOR_REASONS.ROBOTS_DISALLOWED);
    expect(toConnectorReason('UNREACHABLE')).toBe(CONNECTOR_REASONS.UNREACHABLE);
    expect(toConnectorReason('TOO_LARGE')).toBe(CONNECTOR_REASONS.TOO_LARGE);
    expect(toConnectorReason(null)).toBeNull();
  });

  it('refuse d’indexer un site non indexable', async () => {
    const client = {
      indexing: {
        indexConnector: () => {
          throw new Error('appel');
        },
      },
    };
    await expect(indexConnectorPages(client, { id: 'web' }, {})).rejects.toBeTruthy();
  });

  it('renvoie le nombre de pages indexées et le motif du serveur', async () => {
    const client = {
      indexing: {
        indexConnector: async () => ({ indexed: 4, skipped: 0, status: 'DONE', message: null }),
      },
    };
    const run = await indexConnectorPages(client, { id: 'geneanet' }, { lastName: 'Dupont' });
    expect(run.indexed).toBe(4);
    expect(run.reason).toBeNull();
  });

  it('remonte le motif quand l’indexation est refusée par le site', async () => {
    const client = {
      indexing: {
        indexConnector: async () => ({
          indexed: 0,
          skipped: 1,
          status: 'FAILED',
          message: 'ROBOTS_DISALLOWED',
        }),
      },
    };
    const run = await indexConnectorPages(client, { id: 'geneanet' }, {});
    expect(run.reason).toBe(CONNECTOR_REASONS.ROBOTS_DISALLOWED);
  });
});
