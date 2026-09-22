import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import fr from './messages/fr.json';
import en from './messages/en.json';

const messagesByLocale = { fr, en };

export const SUPPORTED_LOCALES = ['fr', 'en'];
export const DEFAULT_LOCALE = 'fr';

const I18nContext = createContext(null);

/**
 * Fournit la locale courante et la fonction de traduction à toute
 * l'arborescence. Aucune dépendance réseau : les messages sont embarqués.
 */
export function I18nProvider({
  locale: controlledLocale,
  defaultLocale = DEFAULT_LOCALE,
  onLocaleChange,
  children,
}) {
  const [internalLocale, setInternalLocale] = useState(defaultLocale);
  const locale = controlledLocale ?? internalLocale;

  const setLocale = useCallback(
    (nextLocale) => {
      if (!SUPPORTED_LOCALES.includes(nextLocale)) {
        return;
      }
      if (onLocaleChange) {
        onLocaleChange(nextLocale);
      }
      if (controlledLocale === undefined) {
        setInternalLocale(nextLocale);
      }
    },
    [controlledLocale, onLocaleChange],
  );

  const t = useCallback(
    (key, fallback) => {
      const messages = messagesByLocale[locale] ?? messagesByLocale[DEFAULT_LOCALE];
      return messages[key] ?? fallback ?? key;
    },
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n doit être utilisé à l’intérieur d’un I18nProvider');
  }
  return context;
}

export function useTranslation() {
  const { t, locale } = useI18n();
  return { t, locale };
}
