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
  // « offline » (par défaut) : aucune requête réseau, carte de position locale.
  // « online » : tuiles OpenStreetMap téléchargées, choix explicite de l'utilisateur.
  mapMode: 'offline',
  // Personnalisation de l'interface.
  accent: 'blue',
  homeView: 'tree',
  hiddenViews: [],
  navOrder: [],
  showInspector: true,
  inspectorWidth: 360,
  sidebarWidth: 232,
  inspectorSections: ['actions', 'relations', 'quality', 'identity'],
  personTabs: ['identity', 'events', 'sources', 'media', 'notes', 'timeline', 'history'],
};

export const ACCENTS = ['blue', 'teal', 'green', 'slate', 'ink'];
export const INSPECTOR_SECTIONS = ['actions', 'relations', 'quality', 'identity'];
export const PERSON_TAB_IDS = [
  'identity',
  'events',
  'sources',
  'media',
  'notes',
  'timeline',
  'history',
];
const VIEW_ID = /^[a-z]{2,20}$/;
// Vues toujours accessibles (on ne peut pas se priver de l'arbre ni des réglages).
export const ALWAYS_VISIBLE_VIEWS = ['tree', 'settings'];

const ACCENTS_OPTIONS = ['blue', 'teal', 'green', 'slate', 'ink'];

const OPTIONS = {
  theme: ['system', 'light', 'dark'],
  textSize: ['standard', 'large', 'xlarge'],
  density: ['standard', 'compact', 'comfortable'],
  reduceMotion: ['system', 'reduce', 'allow'],
  treeMode: ['family', 'ancestors', 'descendants', 'fan', 'graph'],
  accent: ACCENTS_OPTIONS,
  mapMode: ['offline', 'online'],
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
  for (const key of ['showSosa', 'showShortcuts', 'showInspector']) {
    if (typeof raw[key] === 'boolean') result[key] = raw[key];
  }
  const width = (value, min, max) => {
    const number = Number(value);
    return Number.isInteger(number) && number >= min && number <= max ? number : null;
  };
  result.inspectorWidth = width(raw.inspectorWidth, 280, 520) ?? DEFAULT_SETTINGS.inspectorWidth;
  result.sidebarWidth = width(raw.sidebarWidth, 200, 360) ?? DEFAULT_SETTINGS.sidebarWidth;
  const ids = (value) =>
    Array.isArray(value)
      ? [...new Set(value.filter((id) => typeof id === 'string' && VIEW_ID.test(id)))]
      : null;
  if (typeof raw.homeView === 'string' && VIEW_ID.test(raw.homeView))
    result.homeView = raw.homeView;
  result.hiddenViews = (ids(raw.hiddenViews) ?? []).filter(
    (id) => !ALWAYS_VISIBLE_VIEWS.includes(id),
  );
  if (result.hiddenViews.includes(result.homeView)) result.homeView = 'tree';
  result.navOrder = ids(raw.navOrder) ?? [];
  const subset = (value, allowed, fallback) => {
    const list = ids(value);
    return list ? list.filter((id) => allowed.includes(id)) : fallback;
  };
  result.inspectorSections = subset(
    raw.inspectorSections,
    INSPECTOR_SECTIONS,
    DEFAULT_SETTINGS.inspectorSections,
  );
  const tabs = subset(raw.personTabs, PERSON_TAB_IDS, DEFAULT_SETTINGS.personTabs);
  // L'onglet Identité reste toujours disponible.
  result.personTabs = tabs.includes('identity') ? tabs : ['identity', ...tabs];
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
    apply('accent', settings.accent, 'blue');
    root.style.setProperty('--panel-inspector', `${settings.inspectorWidth}px`);
    root.style.setProperty('--sidenav', `${settings.sidebarWidth}px`);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // stockage indisponible : les préférences restent valables pour la session
    }
    // Sous Electron : informe le process principal du mode de carte choisi
    // pour qu'il ajuste la CSP (tuiles OpenStreetMap autorisées uniquement
    // en mode « en ligne » explicite). Absent en dev navigateur : no-op.
    window.geneoapp?.settings?.setMapMode?.(settings.mapMode);
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
