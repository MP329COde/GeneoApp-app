import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, messagesByLocale, translate } from './I18nProvider.jsx';

describe('traductions', () => {
  it('chaque langue fournit toutes les clés du français, avec les mêmes variables', () => {
    const reference = messagesByLocale[DEFAULT_LOCALE];
    const variables = (message) =>
      JSON.stringify(message)
        .match(/\{\w+\}/g)
        ?.sort() ?? [];
    for (const locale of SUPPORTED_LOCALES) {
      const messages = messagesByLocale[locale];
      for (const [key, message] of Object.entries(reference)) {
        expect(messages[key], `${locale} : clé manquante ${key}`).toBeDefined();
        expect([...new Set(variables(messages[key]))], `${locale} : variables de ${key}`).toEqual([
          ...new Set(variables(message)),
        ]);
      }
    }
  });

  it('interpole, applique les pluriels de la langue et retombe sur le français', () => {
    expect(translate('en', 'shell.personCount', { count: 1 })).toBe('1 person');
    expect(translate('en', 'shell.personCount', { count: 3 })).toBe('3 people');
    expect(translate('fr', 'shell.undo', { label: 'Ajout · personne' })).toBe(
      'Annuler : Ajout · personne',
    );
    expect(translate('xx', 'nav.tree')).toBe('Arbre');
    expect(translate('en', 'clé.inconnue', {}, 'repli')).toBe('repli');
  });

  it('traduit les erreurs du serveur dans la langue du client', () => {
    // Le serveur renvoie une clé et des variables, jamais une phrase choisie
    // par lui : c'est le client qui met les phrases dans sa langue.
    expect(
      translate('en', 'server.validation.notAllowed', { field: 'sex', allowed: 'M, F, U' }),
    ).toBe('sex must be one of the following values: M, F, U');
    expect(translate('fr', 'server.validation.required', { field: 'nom' })).toBe(
      'nom est obligatoire',
    );
    expect(translate('en', 'server.error.constraintUnique')).toBe(
      'This item already exists: an identical value is already in use',
    );
  });
});
