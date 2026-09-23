import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

// Chaque fichier messages/<code>.json est une langue : l'ajouter suffit à la
// rendre disponible (nom affiché : clé « language.name »). Aucune requête
// réseau : les messages sont embarqués dans l'application.
const modules = import.meta.glob('./messages/*.json', { eager: true });
const messagesByLocale = Object.fromEntries(
  Object.entries(modules).map(([file, module]) => [
    file.match(/\/([\w-]+)\.json$/)[1],
    module.default ?? module,
  ]),
);

export const DEFAULT_LOCALE = 'fr';
export const SUPPORTED_LOCALES = Object.keys(messagesByLocale).sort((a, b) =>
  a === DEFAULT_LOCALE ? -1 : b === DEFAULT_LOCALE ? 1 : a.localeCompare(b),
);
const STORAGE_KEY = 'geneoapp.locale';

export function languageName(code) {
  return messagesByLocale[code]?.['language.name'] ?? code;
}

function readStoredLocale() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return SUPPORTED_LOCALES.includes(stored) ? stored : null;
  } catch {
    return null;
  }
}

/**
 * Traduit une clé : langue courante, puis français, puis texte de repli.
 * Variables `{nom}` ; pluriels via un objet `{ "one": …, "other": … }` et la
 * variable `count` (règles de pluriel de la langue, Intl.PluralRules).
 */
export function translate(locale, key, variables = {}, fallback) {
  let message = messagesByLocale[locale]?.[key] ?? messagesByLocale[DEFAULT_LOCALE]?.[key];
  if (message === undefined) return fallback ?? key;
  if (typeof message === 'object') {
    const category = new Intl.PluralRules(locale).select(Number(variables.count ?? 0));
    message = message[category] ?? message.other ?? '';
  }
  return message.replace(/\{(\w+)\}/g, (match, name) =>
    variables[name] !== undefined ? String(variables[name]) : match,
  );
}

const I18nContext = createContext(null);

/**
 * Fournit la locale courante et la fonction de traduction à toute
 * l'arborescence ; met à jour `lang` et `dir` du document.
 */
export function I18nProvider({
  locale: controlledLocale,
  defaultLocale,
  onLocaleChange,
  children,
}) {
  const [internalLocale, setInternalLocale] = useState(
    () => defaultLocale ?? readStoredLocale() ?? DEFAULT_LOCALE,
  );
  const locale = controlledLocale ?? internalLocale;

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = locale;
    document.documentElement.dir = messagesByLocale[locale]?.['language.direction'] ?? 'ltr';
  }, [locale]);

  const setLocale = useCallback(
    (nextLocale) => {
      if (!SUPPORTED_LOCALES.includes(nextLocale)) {
        return;
      }
      try {
        localStorage.setItem(STORAGE_KEY, nextLocale);
      } catch {
        // stockage indisponible : valable pour la session
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
    (key, variablesOrFallback, fallback) =>
      typeof variablesOrFallback === 'string'
        ? translate(locale, key, {}, variablesOrFallback)
        : translate(locale, key, variablesOrFallback ?? {}, fallback),
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

export { messagesByLocale };
