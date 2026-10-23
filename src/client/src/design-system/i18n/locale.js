/**
 * Locale courante de l'application.
 *
 * Elle est stockée dans `localStorage` par le sélecteur de langue. Les
 * modules qui ne sont pas des composants React (client API, export d'arbre)
 * en ont besoin pour traduire un message : ils lisent donc le stockage
 * directement, avec un repli sur le français.
 */
export const LOCALE_STORAGE_KEY = 'geneoapp.locale';

export const DEFAULT_LOCALE = 'fr';

export function currentLocale() {
  try {
    return localStorage.getItem(LOCALE_STORAGE_KEY) ?? DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}
