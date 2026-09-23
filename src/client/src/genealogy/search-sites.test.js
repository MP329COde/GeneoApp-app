import { describe, expect, it } from 'vitest';
import { DEFAULT_SITES, buildSearchUrl, validateTemplate } from './search-sites.js';

describe('sites de recherche', () => {
  it('encode les valeurs et laisse vides les inconnues', () => {
    const url = buildSearchUrl('https://ex.org/?n={nom}&p={prenom}&y={annee}', {
      nom: 'Lefèvre & fils',
      prenom: 'Jean-Baptiste',
    });
    expect(url).toBe('https://ex.org/?n=Lef%C3%A8vre%20%26%20fils&p=Jean-Baptiste&y=');
  });

  it('refuse les modèles non https, les variables inconnues et les identifiants', () => {
    expect(validateTemplate('http://ex.org/{nom}')).toMatch(/https/);
    expect(validateTemplate('javascript:alert(1)')).toMatch(/https/);
    expect(validateTemplate('https://ex.org/{motdepasse}')).toMatch(/Variable inconnue/);
    expect(validateTemplate('https://a:b@ex.org/{nom}')).toMatch(/Identifiants/);
    expect(buildSearchUrl('http://ex.org', {})).toBeNull();
  });

  it('les sites fournis par défaut sont valides', () => {
    for (const site of DEFAULT_SITES) expect(validateTemplate(site.template)).toBeNull();
  });
});
