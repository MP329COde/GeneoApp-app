import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SITES,
  TEMPLATE_ERRORS,
  buildSearchUrl,
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
