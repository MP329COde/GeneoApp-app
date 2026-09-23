import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

// Préférences d'affichage locales à cet appareil. Elles ne contiennent aucune
// donnée généalogique : le stockage navigateur suffit et reste hors ligne.
const STORAGE_KEY = 'geneoapp.settings';

export const DEFAULT_SETTINGS = {
  theme: 'system',
  textSize: 'standard',
  density: 'standard',
  reduceMotion: 'system',
  treeMode: 'family',
  treeDepth: 4,
  showSosa: true,
  showShortcuts: true,
};

const OPTIONS = {
  theme: ['system', 'light', 'dark'],
  textSize: ['standard', 'large', 'xlarge'],
  density: ['standard', 'compact', 'comfortable'],
  reduceMotion: ['system', 'reduce', 'allow'],
  treeMode: ['family', 'ancestors', 'descendants', 'fan'],
};

// Valide chaque valeur lue : une préférence corrompue retombe sur la valeur
// par défaut au lieu de casser l'interface.
export function sanitizeSettings(raw) {
  const result = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object') return result;
  for (const [key, allowed] of Object.entries(OPTIONS)) {
    if (allowed.includes(raw[key])) result[key] = raw[key];
  }
  const depth = Number(raw.treeDepth);
  if (Number.isInteger(depth) && depth >= 1 && depth <= 30) result.treeDepth = depth;
  for (const key of ['showSosa', 'showShortcuts']) {
    if (typeof raw[key] === 'boolean') result[key] = raw[key];
  }
  return result;
}

function readSettings() {
  try {
    return sanitizeSettings(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

const SettingsContext = createContext({
  settings: DEFAULT_SETTINGS,
  update: () => {},
  reset: () => {},
});

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(readSettings);

  useEffect(() => {
    const root = document.documentElement;
    const apply = (name, value, neutral) => {
      if (value === neutral) delete root.dataset[name];
      else root.dataset[name] = value;
    };
    apply('theme', settings.theme, 'system');
    apply('textSize', settings.textSize, 'standard');
    apply('density', settings.density, 'standard');
    apply('motion', settings.reduceMotion, 'system');
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // stockage indisponible : les préférences restent valables pour la session
    }
  }, [settings]);

  const update = useCallback((patch) => {
    setSettings((current) => sanitizeSettings({ ...current, ...patch }));
  }, []);
  const reset = useCallback(() => setSettings({ ...DEFAULT_SETTINGS }), []);

  const value = useMemo(() => ({ settings, update, reset }), [settings, update, reset]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  return useContext(SettingsContext);
}
