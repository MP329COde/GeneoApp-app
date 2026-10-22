import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { List } from 'react-window';
import { Badge, Button, Modal, useI18n } from './design-system/index.js';
import { client, writeListeners } from './api/app-client.js';
import { VerificationContext, useVerification } from './hooks/useVerification.js';
export { buildVerificationIssues, verificationNotifications } from './hooks/useVerification.js';
import { TreeExplorer } from './views/TreeExplorer.jsx';
import { RelationshipPanel } from './views/RelationshipPanel.jsx';
import { buildLifespans } from './genealogy/lifespans.js';
import { ComparePanel } from './views/ComparePanel.jsx';
import { QualityCard } from './views/QualityCard.jsx';
import { AnnotationsHub } from './views/AnnotationsPanel.jsx';
import { QuickSearch } from './views/QuickSearch.jsx';
import { IndexingPanel } from './views/IndexingPanel.jsx';
import { PortraitAvatar } from './views/DocumentTools.jsx';
import { NotebookPanel } from './views/NotebookPanel.jsx';
import { TreesPanel } from './views/TreesPanel.jsx';
import { SettingsPanel } from './views/SettingsPanel.jsx';
import { SettingsProvider, useSettings } from './settings/SettingsContext.jsx';
import appIcon from './assets/geneoapp-icon.png';
import { Icon, ErrorNotice, personLabel } from './components/shared.jsx';
import { TreeLegend } from './components/TreeLegend.jsx';
import { NotificationCenter } from './components/NotificationCenter.jsx';
import { CreatePersonForm, SearchPanel, DuplicatesPanel } from './views/PersonListPanels.jsx';
import { FamiliesPanel } from './views/FamiliesView.jsx';
import { EventsPanel, TimelinePanel } from './views/EventsTimelineView.jsx';
import { MapPanel } from './views/MapView.jsx';
import { VerificationSection, ConsistencyPanel } from './views/VerificationPanels.jsx';
import {
  IdentityTool,
  SourcesPanel,
  AuditPanel,
  NotesPanel,
  StatisticsPanel,
  AiPanel,
} from './views/PersonDetailTools.jsx';
import { DocumentsHub, MediaPanel, GedcomPanel } from './views/DocumentsGedcomView.jsx';
import { BackupsPanel } from './views/AccountsBackupsView.jsx';
import { PersonSheet } from './views/PersonSheetView.jsx';
import './styles/base.css';
import './styles/startup.css';
import './styles/layout.css';
import './styles/notifications.css';
import './styles/workspace.css';
import './styles/typography.css';
import './styles/persons.css';
import './styles/tree.css';
import './styles/timeline.css';
import './styles/inspector.css';
import './styles/messages.css';
import './styles/forms.css';
import './styles/panels.css';
import './styles/map.css';
import './styles/responsive.css';
import './styles/view-forms.css';
import './styles/tree-explorer.css';
import './styles/relations.css';
import './styles/person-sheet.css';
import './styles/preferences.css';
import './styles/settings.css';
import './styles/fan-chart.css';
import './styles/trees.css';
import './styles/notebook.css';
import './styles/export-print.css';
import './styles/profile-trash.css';
import './styles/photos.css';
import './styles/data-quality.css';
import './styles/tree-filters.css';
import './styles/minimap.css';
import './styles/backups.css';
import './styles/life-timeline.css';
import './styles/comparison.css';
import './styles/advanced-search.css';
import './styles/quality.css';
import './styles/site-search.css';
import './styles/graph.css';
import './styles/annotations.css';
import './styles/sidenav-people.css';
import './styles/inspector-compact.css';
import './styles/quick-search.css';
import './styles/components.css';
import './styles/customization.css';
import './styles/indexing.css';
import './styles/verification.css';
import './styles/indexing-preview.css';
import './styles/portraits.css';
import './styles/doc-decoder.css';

// Architecture de navigation : vues regroupées en 5 familles repliables, du
// point de vue généalogie (Personnes & familles, Recherche & vérification,
// Documents & sources, Outils & import, Paramètres). La vérification au fil
// de l'eau reste intégrée aux fiches et à l'arbre ; l'écran « Cohérence »
// permet en plus un contrôle global sur tout l'arbre en un clic.
// Chaque entrée porte la clé i18n de son libellé : la navigation est rendue
// dans la langue de l'utilisateur, et `SettingsPanel` reçoit les mêmes clés
// pour proposer le renommage des entrées.
const NAV_GROUPS = [
  {
    key: 'people',
    labelKey: 'nav.group.people',
    items: [
      { id: 'tree', labelKey: 'nav.tree', icon: 'tree', shortcut: '⌘1' },
      { id: 'person', labelKey: 'nav.person', icon: 'person', shortcut: '⌘2' },
      { id: 'families', labelKey: 'nav.families', icon: 'family', shortcut: '⌘3' },
      { id: 'relations', labelKey: 'nav.relations', icon: 'family' },
    ],
  },
  {
    key: 'search',
    labelKey: 'nav.group.search',
    items: [
      { id: 'search', labelKey: 'nav.search', icon: 'search', shortcut: '⌘4' },
      { id: 'compare', labelKey: 'nav.compare', icon: 'duplicate' },
      { id: 'consistency', labelKey: 'nav.consistency', icon: 'family' },
      { id: 'statistics', labelKey: 'nav.statistics', icon: 'stats' },
    ],
  },
  {
    key: 'documents',
    labelKey: 'nav.group.documents',
    items: [
      { id: 'sources', labelKey: 'nav.sources', icon: 'source' },
      { id: 'media', labelKey: 'nav.media', icon: 'media' },
      { id: 'documents', labelKey: 'nav.decode', icon: 'file' },
      { id: 'events', labelKey: 'nav.events', icon: 'event' },
      { id: 'timeline', labelKey: 'nav.timeline', icon: 'timeline' },
      { id: 'map', labelKey: 'nav.map', icon: 'map' },
      { id: 'annotations', labelKey: 'nav.annotations', icon: 'notebook' },
      { id: 'indexing', labelKey: 'nav.indexing', icon: 'search' },
      { id: 'notebook', labelKey: 'nav.notebook', icon: 'notebook' },
    ],
  },
  {
    key: 'tools',
    labelKey: 'nav.group.tools',
    items: [
      { id: 'trees', labelKey: 'nav.trees', icon: 'tree' },
      { id: 'gedcom', labelKey: 'nav.gedcom', icon: 'file' },
      { id: 'backups', labelKey: 'nav.backups', icon: 'backup' },
      { id: 'trash', labelKey: 'nav.trash', icon: 'trash' },
      { id: 'ai', labelKey: 'nav.ai', icon: 'chip' },
    ],
  },
  {
    key: 'settings',
    labelKey: 'nav.group.settings',
    items: [
      { id: 'profile', labelKey: 'nav.profile', icon: 'person' },
      { id: 'settings', labelKey: 'nav.settings', icon: 'settings' },
    ],
  },
];

// Barre d'onglets mobile (< 720px) : 4 destinations directes plus « Plus »,
// qui ouvre une feuille listant le menu complet (NAV_GROUPS). Remplace le
// ruban horizontal d'icônes de la version précédente, illisible sur un
// écran de 390px (aucun libellé visible, défilement latéral au doigt).
const MOBILE_TABS = [
  { id: 'tree', labelKey: 'nav.tree', icon: 'tree' },
  { id: 'person', labelKey: 'nav.person', icon: 'person' },
  { id: 'search', labelKey: 'nav.search', icon: 'search' },
  { id: 'documents', labelKey: 'nav.documents', icon: 'file' },
];

// Années de vie partagées par toutes les fiches (calculées depuis les événements).
const LifespanContext = createContext(new Map());

function PersonCard({ person, selected, onSelect, onKeyDown, compact = false }) {
  const { t } = useI18n();
  const lifespan = useContext(LifespanContext).get(person.id);
  const years = lifespan?.label;
  // Le lieu de naissance est affiché en plus des années pour distinguer deux
  // personnes homonymes dans une liste : « Jean Martin — 1850 – 1920 (Rouen) ».
  const birthPlace = lifespan?.birthPlace;
  const issues = useContext(VerificationContext).get(person.id)?.length ?? 0;
  const fullName = personLabel(person);
  const issueCount = t('shell.issueCount', { count: issues });
  return (
    <button
      className={`person-card${compact ? ' person-card--compact' : ''}${selected ? ' person-card--selected' : ''}${issues ? ' has-issues' : ''}`}
      onClick={() => onSelect(person.id)}
      onKeyDown={onKeyDown}
      type="button"
    >
      {person.portrait_media_id ? (
        <PortraitAvatar client={client} person={person} size={36} />
      ) : null}
      <span className="person-card__lines">
        {/* Le nom de famille est prioritaire : il ne rétrécit jamais, seul le
         * prénom cède la place en cas de manque d'espace (ex. colonne latérale
         * étroite). `title` porte le nom complet pour l'accessibilité. */}
        <span className="person-card__name" title={fullName}>
          <span className="person-card__given">{person.given_names}</span>{' '}
          <span className="person-card__family">{person.family_name}</span>
        </span>
        {years || birthPlace ? (
          <span className="person-card__meta">
            {years ? <span className="person-card__years">{years}</span> : null}
            {birthPlace ? <span className="person-card__place">({birthPlace})</span> : null}
          </span>
        ) : null}
      </span>
      {issues ? (
        <span className="issue-dot" title={issueCount}>
          <span className="gds-visually-hidden">{issueCount}</span>
        </span>
      ) : null}
    </button>
  );
}

// Au-delà de ce nombre de personnes, la liste latérale est virtualisée
// (react-window) : seules les lignes visibles (+ marge) sont montées dans le
// DOM, ce qui garde la liste fluide même avec des milliers de fiches.
const VIRTUALIZATION_THRESHOLD = 150;
// 2 niveaux (nom complet + années/lieu) : 56px suffisent à afficher les deux
// lignes sans les faire chevaucher (cf. PERSON_ROW_HEIGHT côté CSS).
const PERSON_ROW_HEIGHT = 56;

function PersonListRow({ index, style, persons, selectedId, onSelect }) {
  const person = persons[index];
  return (
    <div style={style}>
      <PersonCard
        person={person}
        selected={person.id === selectedId}
        onSelect={onSelect}
        compact
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
          event.preventDefault();
          const delta = event.key === 'ArrowDown' ? 1 : -1;
          const nextIndex = (index + delta + persons.length) % persons.length;
          onSelect(persons[nextIndex].id);
        }}
      />
    </div>
  );
}

function ThemeToggle() {
  const { settings, update } = useSettings();
  const { t } = useI18n();
  const prefersDark =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const isDark = settings.theme === 'dark' || (settings.theme === 'system' && prefersDark);
  return (
    <button
      type="button"
      className="icon-button"
      aria-label={isDark ? t('theme.toLight') : t('theme.toDark')}
      title={isDark ? t('theme.toLight') : t('theme.toDark')}
      onClick={() => update({ theme: isDark ? 'light' : 'dark' })}
    >
      <Icon name={isDark ? 'sun' : 'moon'} />
    </button>
  );
}

// Poignée de redimensionnement de l'inspecteur (souris, pavé tactile, clavier).
function InspectorResizer() {
  const { settings, update } = useSettings();
  const { t } = useI18n();
  const clamp = (width) => Math.min(520, Math.max(280, Math.round(width)));
  // Motif ARIA « window splitter » : séparateur focusable réglé au clavier.
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      className="inspector-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label={t('shell.inspectorWidth', 'Largeur du panneau de la personne')}
      aria-valuemin={280}
      aria-valuemax={520}
      aria-valuenow={settings.inspectorWidth}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 40 : 10;
        if (event.key === 'ArrowLeft')
          update({ inspectorWidth: clamp(settings.inspectorWidth + step) });
        if (event.key === 'ArrowRight')
          update({ inspectorWidth: clamp(settings.inspectorWidth - step) });
      }}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture?.(event.pointerId);
        const startX = event.clientX;
        const startWidth = settings.inspectorWidth;
        const move = (moveEvent) =>
          update({ inspectorWidth: clamp(startWidth + startX - moveEvent.clientX) });
        const stop = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', stop);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', stop);
      }}
    />
  );
}

function AppContent() {
  const { settings, update: updateSettings } = useSettings();
  const { t } = useI18n();
  const [persons, setPersons] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [relations, setRelations] = useState(null);
  const { settings: initialSettings } = useSettings();
  const [view, setView] = useState(() => initialSettings.homeView ?? 'tree');
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [session, setSession] = useState(null);
  const [loginError, setLoginError] = useState(null);
  const [activeTree, setActiveTree] = useState(null);
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const [historyMessage, setHistoryMessage] = useState('');
  const [dataVersion, setDataVersion] = useState(0);
  const [lifespans, setLifespans] = useState(() => new Map());
  const [personFilter, setPersonFilter] = useState('');
  const [creatingOpen, setCreatingOpen] = useState(false);
  const [emptyPrompted, setEmptyPrompted] = useState(false);
  // Sections du menu repliées par l'utilisateur (persisté pour rester stable
  // d'une session à l'autre) ; une section contenant la vue ouverte reste
  // toujours dépliée pour ne pas masquer l'entrée active.
  const [collapsedNavGroups, setCollapsedNavGroups] = useState(() => {
    try {
      const stored = window.localStorage.getItem('geneoapp:collapsedNavGroups');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });
  const toggleNavGroup = (key) => {
    setCollapsedNavGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        window.localStorage.setItem('geneoapp:collapsedNavGroups', JSON.stringify([...next]));
      } catch {
        // Le repli du menu reste une préférence facultative si le stockage échoue.
      }
      return next;
    });
  };
  // Feuille « Plus » de la barre d'onglets mobile (menu complet).
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const quickSearchRef = useRef(null);

  useEffect(() => {
    if (persons?.length === 0 && !emptyPrompted) {
      setEmptyPrompted(true);
      setCreatingOpen(true);
    }
  }, [persons, emptyPrompted]);

  // La modale "Nouvelle personne" est liée à l'écran courant : toute navigation
  // vers un autre écran du menu latéral la referme pour ne jamais rester bloquante
  // par-dessus un écran qu'elle ne concerne plus (cf. BUG-001).
  useEffect(() => {
    setCreatingOpen(false);
  }, [view]);

  const handleLogin = async (name, pin) => {
    setLoginError(null);
    try {
      const { token, account } = await client.accounts.login(name, pin);
      setSession({ token, account });
    } catch (loginErr) {
      if (loginErr.status !== 401) {
        setLoginError(loginErr.message);
        return;
      }
      // Premier lancement local : aucun écran séparé de création de profil,
      // on crée le profil à la volée si le nom est inconnu.
      try {
        await client.accounts.create({ name, pin });
        const { token, account } = await client.accounts.login(name, pin);
        setSession({ token, account });
      } catch (createErr) {
        setLoginError(createErr.message);
      }
    }
  };

  const loadPersons = useCallback(async () => {
    try {
      const list = await client.persons.list();
      setPersons(list);
      setSelectedId((current) => current ?? list[0]?.id ?? null);
    } catch (loadError) {
      setError(loadError.message);
    }
  }, []);

  useEffect(() => {
    loadPersons();
  }, [loadPersons]);

  useEffect(() => {
    client.trees
      ?.active()
      .then(setActiveTree)
      .catch(() => setActiveTree(null));
  }, []);

  const refreshLifespans = useCallback(async () => {
    try {
      setLifespans(buildLifespans((await client.events.listAll()) ?? [], t));
    } catch {
      // les années de vie sont un confort d'affichage, jamais bloquantes
    }
  }, [t]);

  useEffect(() => {
    refreshLifespans();
    writeListeners.add(refreshLifespans);
    return () => writeListeners.delete(refreshLifespans);
  }, [refreshLifespans, dataVersion, activeTree?.id]);

  const refreshHistory = useCallback(async () => {
    try {
      const status = await client.history?.status(1);
      if (status) setHistory(status);
    } catch {
      // l'historique est une aide : son indisponibilité ne bloque rien
    }
  }, []);

  useEffect(() => {
    refreshHistory();
    writeListeners.add(refreshHistory);
    return () => writeListeners.delete(refreshHistory);
  }, [refreshHistory]);

  const applyHistory = useCallback(
    async (direction) => {
      try {
        const result = await client.history[direction]();
        const label = direction === 'undo' ? result.undone : result.redone;
        setHistory(result);
        if (!label) return;
        setHistoryMessage(
          direction === 'undo'
            ? t('shell.undone', { label }, `Annulé : ${label}`)
            : t('shell.redone', { label }, `Rétabli : ${label}`),
        );
        // Les panneaux rechargent leurs données après un retour en arrière.
        setDataVersion((version) => version + 1);
        const list = await client.persons.list();
        setPersons(list);
        setSelectedId((current) =>
          list.some((person) => person.id === current) ? current : (list[0]?.id ?? null),
        );
      } catch (historyError) {
        setError(historyError.message);
      }
    },
    [t],
  );

  // Ctrl/⌘+Z annule, Ctrl/⌘+Maj+Z ou Ctrl+Y rétablit ; dans un champ de
  // saisie, le raccourci garde son comportement natif (annuler la frappe).
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      ) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        applyHistory('undo');
      } else if ((key === 'z' && event.shiftKey) || (key === 'y' && event.ctrlKey)) {
        event.preventDefault();
        applyHistory('redo');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [applyHistory]);

  // Changer d'arbre : toute la sélection appartient à l'ancien arbre.
  const handleTreeActivated = async (tree) => {
    setActiveTree(tree);
    setSelectedId(null);
    setRelations(null);
    setSession(null);
    setPersons(await client.persons.list());
    refreshHistory();
  };

  const loadRelations = useCallback(async () => {
    if (selectedId === null) {
      setRelations(null);
      return;
    }
    try {
      setRelations(await client.graph.relations(selectedId));
    } catch (relationsError) {
      setError(relationsError.message);
    }
  }, [selectedId]);

  useEffect(() => {
    // Les relations précédentes restent affichées jusqu'à l'arrivée des
    // nouvelles : l'arbre n'est plus démonté à chaque changement de personne.
    loadRelations();
    // dataVersion : recharger aussi après Annuler/Rétablir sur la même personne.
  }, [loadRelations, dataVersion]);

  // Personne active persistante : la dernière personne consultée (par arbre)
  // est rouverte automatiquement ; à défaut, la première de la liste. Aucune
  // vue n'exige donc de re-sélectionner quelqu'un.
  const selectionStorageKey = `geneoapp:selected:${activeTree?.id ?? 'local'}`;
  useEffect(() => {
    if (!persons?.length) return;
    if (selectedId !== null && persons.some((person) => person.id === selectedId)) return;
    let stored = null;
    try {
      stored = Number(window.localStorage.getItem(selectionStorageKey));
    } catch {
      // stockage indisponible : on retombe sur la première personne
    }
    const fallback = persons.find((person) => person.id === stored) ?? persons[0];
    setSelectedId(fallback.id);
  }, [persons, selectedId, selectionStorageKey]);

  useEffect(() => {
    if (selectedId === null) return;
    try {
      window.localStorage.setItem(selectionStorageKey, String(selectedId));
    } catch {
      // confort uniquement
    }
  }, [selectedId, selectionStorageKey]);

  useEffect(() => {
    const shortcuts = NAV_GROUPS.flatMap((group) => group.items).filter((item) => item.shortcut);
    const handleKeyDown = (event) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      if (event.key.toLowerCase() === 'k') {
        event.preventDefault();
        quickSearchRef.current?.focus();
        return;
      }
      const item = shortcuts[Number(event.key) - 1];
      if (!item) return;
      event.preventDefault();
      setView(item.id);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleCreate = async (data) => {
    setCreating(true);
    setError(null);
    try {
      const person = await client.persons.create(data);
      await loadPersons();
      setSelectedId(person.id);
      setCreatingOpen(false);
      return true;
    } catch (createError) {
      setError(createError.message);
      return false;
    } finally {
      setCreating(false);
    }
  };

  const selected = useMemo(
    () => persons?.find((person) => person.id === selectedId) ?? null,
    [persons, selectedId],
  );

  const personLabelById = (id) => {
    const person = persons?.find((candidate) => candidate.id === id);
    return person ? personLabel(person) : `Personne #${id}`;
  };

  // Fait avancer `verificationRunToken` : démarrage (au premier chargement des
  // personnes, via l'effet de useVerification), après un import GEDCOM, ou à
  // la demande (bouton « Relancer la vérification »). Jamais après chaque
  // écriture individuelle (cf. useVerification).
  const [verificationRunToken, setVerificationRunToken] = useState(0);
  const rerunVerification = useCallback(() => setVerificationRunToken((token) => token + 1), []);
  const handleImported = useCallback(async () => {
    await loadPersons();
    rerunVerification();
  }, [loadPersons, rerunVerification]);
  const { issues: verificationIssues, running: verificationRunning } = useVerification({
    persons,
    runToken: verificationRunToken,
    personLabelById,
  });
  const [compareTarget, setCompareTarget] = useState(null);
  const openCompare = (otherId) => {
    setCompareTarget(otherId);
    setView('compare');
  };
  const handleVerificationMerged = async (survivorId) => {
    await loadPersons();
    setSelectedId(survivorId);
    await loadRelations();
  };
  const openPerson = (id) => {
    setSelectedId(id);
    if (!['tree', 'person'].includes(view)) setView('tree');
  };

  if (persons === null) {
    return (
      <main className="startup" aria-labelledby="app-title">
        <div className="startup__card">
          <img className="startup__logo" src={appIcon} alt="" width="56" height="56" />
          <h1 id="app-title">GeneoApp</h1>
          <div className="startup__progress" aria-hidden="true">
            <span />
          </div>
          <p role="status">{t('shell.loadingLocalData', 'Chargement des données locales…')}</p>
        </div>
      </main>
    );
  }

  const currentView = NAV_GROUPS.flatMap((group) => group.items).find((item) => item.id === view);
  // Menu personnalisé : entrées masquées (sauf la vue ouverte) et ordre choisi.
  const orderOf = (id, fallback) => {
    const index = settings.navOrder.indexOf(id);
    return index >= 0 ? index : 1000 + fallback;
  };
  const navGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.id === view || !settings.hiddenViews.includes(item.id))
      .sort((a, b) => orderOf(a.item.id, a.index) - orderOf(b.item.id, b.index))
      .map(({ item }) => item),
  })).filter((group) => group.items.length > 0);
  // Filtre de la liste latérale (accents et casse ignorés).
  const fold = (value) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  const visiblePersons = personFilter.trim()
    ? persons.filter((person) => fold(personLabel(person)).includes(fold(personFilter.trim())))
    : persons;

  return (
    <LifespanContext.Provider value={lifespans}>
      <VerificationContext.Provider value={verificationIssues}>
        <main className="genealogy-app" aria-labelledby="app-title">
          <aside className="sidenav" aria-label={t('nav.main', 'Navigation principale')}>
            <div className="sidenav__brand">
              <img src={appIcon} alt="" width="32" height="32" />
              <h1 id="app-title">GeneoApp</h1>
            </div>
            <div className="sidenav__people sidenav__persons">
              <h2 className="sidenav__label">
                {t('shell.persons')} ·{' '}
                <span>{t('shell.personCount', { count: persons.length })}</span>
              </h2>
              <div className="new-person-button">
                <Button size="sm" onClick={() => setCreatingOpen(true)}>
                  {t('shell.newPerson', '+ Nouvelle personne')}
                </Button>
              </div>
              <div className="verification-rerun-button">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={rerunVerification}
                  disabled={verificationRunning}
                  title={t(
                    'verification.rerunHint',
                    'Recherche à nouveau les doublons, cycles et incohérences de dates',
                  )}
                >
                  {verificationRunning
                    ? t('verification.running', 'Vérification en cours…')
                    : t('verification.rerun', 'Relancer la vérification')}
                </Button>
              </div>
              <Modal
                isOpen={creatingOpen}
                title={t('shell.newPersonTitle', 'Nouvelle personne')}
                onClose={() => setCreatingOpen(false)}
              >
                <CreatePersonForm onCreate={handleCreate} creating={creating} />
              </Modal>
              {persons.length > 5 ? (
                <label className="person-filter">
                  <span className="gds-visually-hidden">
                    {t('shell.filterPersons', 'Filtrer les personnes')}
                  </span>
                  <input
                    type="search"
                    placeholder={t('shell.filterPersonsPlaceholder', 'Filtrer les personnes…')}
                    value={personFilter}
                    onChange={(event) => setPersonFilter(event.target.value)}
                  />
                </label>
              ) : null}
              <nav className="person-list" aria-label={t('shell.persons', 'Personnes')}>
                {persons.length === 0 ? (
                  <p className="notice">
                    {t(
                      'shell.noPersons',
                      'Aucune personne enregistrée. Utilisez « Nouvelle personne » pour démarrer votre arbre.',
                    )}
                  </p>
                ) : visiblePersons.length > VIRTUALIZATION_THRESHOLD ? (
                  <List
                    rowComponent={PersonListRow}
                    rowCount={visiblePersons.length}
                    rowHeight={PERSON_ROW_HEIGHT}
                    rowProps={{ persons: visiblePersons, selectedId, onSelect: setSelectedId }}
                    style={{ height: Math.min(visiblePersons.length * PERSON_ROW_HEIGHT, 480) }}
                  />
                ) : (
                  visiblePersons.map((person, index) => (
                    <PersonCard
                      key={person.id}
                      person={person}
                      selected={person.id === selectedId}
                      onSelect={setSelectedId}
                      onKeyDown={(event) => {
                        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
                        event.preventDefault();
                        const delta = event.key === 'ArrowDown' ? 1 : -1;
                        const nextIndex =
                          (index + delta + visiblePersons.length) % visiblePersons.length;
                        setSelectedId(visiblePersons[nextIndex].id);
                        const buttons =
                          event.currentTarget.parentElement.querySelectorAll('.person-card');
                        buttons[nextIndex]?.focus();
                      }}
                    />
                  ))
                )}
              </nav>
            </div>
            <div className="sidenav__scroll">
              <div className="view-switcher" role="group" aria-label={t('nav.views', 'Vues')}>
                {navGroups.map((group) => {
                  const isCollapsed =
                    collapsedNavGroups.has(group.key) &&
                    !group.items.some((item) => item.id === view);
                  return (
                    <div className="sidenav__group" key={group.key}>
                      <button
                        type="button"
                        className="sidenav__label sidenav__label--toggle"
                        aria-expanded={!isCollapsed}
                        aria-label={t(
                          isCollapsed ? 'nav.group.toggleExpand' : 'nav.group.toggleCollapse',
                          { section: t(group.labelKey) },
                        )}
                        onClick={() => toggleNavGroup(group.key)}
                      >
                        <span aria-hidden="true">{t(group.labelKey)}</span>
                        <Icon name={isCollapsed ? 'chevron-right' : 'chevron-down'} />
                      </button>
                      {isCollapsed
                        ? null
                        : group.items.map((item) => (
                            <button
                              key={item.id}
                              className={`sidenav__item${view === item.id ? ' is-active' : ''}`}
                              aria-current={view === item.id ? 'page' : undefined}
                              onClick={() => setView(item.id)}
                              type="button"
                              title={t(item.labelKey)}
                              aria-label={t(item.labelKey)}
                            >
                              <Icon name={item.icon} />
                              <span className="sidenav__text">{t(item.labelKey)}</span>
                              {item.shortcut && settings.showShortcuts ? (
                                <kbd className="sidenav__kbd" aria-hidden="true">
                                  {item.shortcut}
                                </kbd>
                              ) : null}
                            </button>
                          ))}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="sidenav__footer">
              <p>
                <Icon name="offline" /> {t('shell.offlineLocal')}
              </p>
            </div>
          </aside>

          <nav className="mobile-tabbar" aria-label={t('nav.main', 'Navigation principale')}>
            {MOBILE_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`mobile-tabbar__item${view === tab.id ? ' is-active' : ''}`}
                aria-current={view === tab.id ? 'page' : undefined}
                onClick={() => {
                  setMobileMenuOpen(false);
                  setView(tab.id);
                }}
              >
                <Icon name={tab.icon} />
                <span>{t(tab.labelKey)}</span>
              </button>
            ))}
            <button
              type="button"
              className="mobile-tabbar__item"
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((open) => !open)}
            >
              <Icon name="panel" />
              <span>{t('shell.more', 'Plus')}</span>
            </button>
          </nav>
          {mobileMenuOpen ? (
            <div
              className="mobile-menu-sheet"
              role="dialog"
              aria-label={t('shell.fullMenu', 'Menu complet')}
            >
              <div className="mobile-menu-sheet__header">
                <strong>{t('shell.menu', 'Menu')}</strong>
                <Button size="sm" variant="secondary" onClick={() => setMobileMenuOpen(false)}>
                  {t('modal.close', 'Fermer')}
                </Button>
              </div>
              {navGroups.map((group) => (
                <div className="mobile-menu-sheet__group" key={group.key}>
                  <p className="mobile-menu-sheet__label">{t(group.labelKey)}</p>
                  {group.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`mobile-menu-sheet__item${view === item.id ? ' is-active' : ''}`}
                      aria-current={view === item.id ? 'page' : undefined}
                      onClick={() => {
                        setMobileMenuOpen(false);
                        setView(item.id);
                      }}
                    >
                      <Icon name={item.icon} />
                      <span>{t(item.labelKey)}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ) : null}

          <header className="topbar">
            <p className="topbar__crumbs">
              <button type="button" className="topbar__tree" onClick={() => setView('trees')}>
                {activeTree?.name ?? t('shell.localTree', 'Arbre local')}
              </button>
              <span aria-hidden="true">›</span>
              <strong>{currentView ? t(currentView.labelKey) : t('nav.tree')}</strong>
            </p>
            {selected ? (
              <p className="topbar__context">
                <Icon name="person" />
                <span>{t('shell.context')}</span>
                <strong className="person-name">{personLabel(selected)}</strong>
                {lifespans.get(selected.id) ? (
                  <span className="data-id">{lifespans.get(selected.id).label}</span>
                ) : null}
                <span className="data-id">#{selected.id}</span>
              </p>
            ) : null}
            <QuickSearch
              ref={quickSearchRef}
              persons={persons}
              lifespans={lifespans}
              onPick={setSelectedId}
            />
            <div className="topbar__actions">
              <div
                className="history-controls"
                role="group"
                aria-label={t('shell.history', 'Historique')}
              >
                <button
                  type="button"
                  className="icon-button"
                  disabled={!history.canUndo}
                  aria-label={
                    history.canUndo
                      ? t('shell.undo', { label: history.undoLabel })
                      : t('shell.nothingToUndo')
                  }
                  title={
                    history.canUndo
                      ? t('shell.undoShortcut', { label: history.undoLabel })
                      : t('shell.nothingToUndo')
                  }
                  onClick={() => applyHistory('undo')}
                >
                  <Icon name="undo" />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  disabled={!history.canRedo}
                  aria-label={
                    history.canRedo
                      ? t('shell.redo', { label: history.redoLabel })
                      : t('shell.nothingToRedo')
                  }
                  title={
                    history.canRedo
                      ? t('shell.redoShortcut', { label: history.redoLabel })
                      : t('shell.nothingToRedo')
                  }
                  onClick={() => applyHistory('redo')}
                >
                  <Icon name="redo" />
                </button>
              </div>
              <p className="gds-visually-hidden" role="status" aria-live="polite">
                {historyMessage}
              </p>
              <Badge tone="success">{t('shell.offline')}</Badge>
              <NotificationCenter onOpenPerson={openPerson} />
              <button
                type="button"
                className="icon-button"
                aria-pressed={settings.showInspector}
                aria-label={
                  settings.showInspector
                    ? t('shell.hideInspector', 'Masquer le panneau de la personne')
                    : t('shell.showInspector', 'Afficher le panneau de la personne')
                }
                title={t('shell.inspector', 'Panneau de la personne')}
                onClick={() => updateSettings({ showInspector: !settings.showInspector })}
              >
                <Icon name="panel" />
              </button>
              <ThemeToggle />
            </div>
          </header>

          {error ? <ErrorNotice message={error} className="app-error" /> : null}

          <section
            className={`workspace${settings.showInspector ? '' : ' workspace--no-inspector'}`}
            aria-label={t('shell.genealogySpace', 'Espace de généalogie')}
          >
            <section className="canvas-panel" aria-label={t('shell.treeView', 'Vue de l’arbre')}>
              {/* L'arbre se recharge lui-même (refreshKey) : le remonter à chaque
                écriture perdait mode, zoom et replis, et faisait sauter l'écran. */}
              <div
                key={view === 'tree' ? 'tree' : `${view}-${dataVersion}`}
                className={`genealogy-canvas genealogy-canvas--${view}`}
              >
                {view === 'search' ? (
                  <SearchPanel
                    selected={selected}
                    lifespan={selected ? lifespans.get(selected.id) : null}
                    onNavigate={(id) => {
                      setSelectedId(id);
                      setView('person');
                    }}
                  />
                ) : view === 'gedcom' ? (
                  <GedcomPanel onImported={handleImported} selected={selected} />
                ) : view === 'backups' || view === 'trash' || view === 'profile' ? (
                  <BackupsPanel
                    section={
                      view === 'trash' ? 'trash' : view === 'profile' ? 'profile' : 'backups'
                    }
                    session={session}
                    onLogin={handleLogin}
                    loginError={loginError}
                    onLogout={() => setSession(null)}
                  />
                ) : view === 'duplicates' ? (
                  <DuplicatesPanel
                    onSelect={(id) => {
                      setSelectedId(id);
                      setView('tree');
                    }}
                    onMerged={async () => {
                      await loadPersons();
                      await loadRelations();
                    }}
                  />
                ) : view === 'families' ? (
                  <FamiliesPanel
                    persons={persons}
                    selected={selected}
                    onNavigate={setSelectedId}
                    onChange={loadRelations}
                  />
                ) : view === 'indexing' ? (
                  <IndexingPanel client={client} />
                ) : view === 'annotations' ? (
                  <AnnotationsHub client={client} />
                ) : view === 'notes' ? (
                  <NotesPanel selected={selected} />
                ) : view === 'audit' ? (
                  <AuditPanel selected={selected} />
                ) : view === 'media' ? (
                  <MediaPanel selected={selected} persons={persons} onPersonChanged={loadPersons} />
                ) : view === 'documents' ? (
                  <DocumentsHub
                    onOpenPerson={(person) => {
                      setSelectedId(person.id);
                      setView('person');
                    }}
                    onChanged={loadPersons}
                  />
                ) : view === 'sources' ? (
                  <SourcesPanel selected={selected} />
                ) : view === 'events' ? (
                  <EventsPanel selected={selected} />
                ) : view === 'timeline' ? (
                  <TimelinePanel
                    onNavigate={(id) => {
                      setSelectedId(id);
                      setView('tree');
                    }}
                  />
                ) : view === 'map' ? (
                  <MapPanel />
                ) : view === 'consistency' ? (
                  <ConsistencyPanel
                    personLabelById={personLabelById}
                    onNavigate={(id) => {
                      setSelectedId(id);
                      setView('tree');
                    }}
                  />
                ) : view === 'notebook' ? (
                  <NotebookPanel
                    client={client}
                    persons={persons}
                    onNavigate={(id) => {
                      setSelectedId(id);
                      setView('tree');
                    }}
                  />
                ) : view === 'statistics' ? (
                  <StatisticsPanel />
                ) : view === 'ai' ? (
                  <AiPanel />
                ) : view === 'trees' ? (
                  <TreesPanel client={client} onActivated={handleTreeActivated} session={session} />
                ) : view === 'settings' ? (
                  <SettingsPanel navGroups={NAV_GROUPS} />
                ) : view === 'person' && selected ? (
                  <PersonSheet
                    selected={selected}
                    relations={relations}
                    onUpdated={loadPersons}
                    persons={persons}
                    onDeleted={async () => {
                      await loadPersons();
                      setSelectedId(null);
                      setView('tree');
                    }}
                    verification={
                      <VerificationSection
                        selected={selected}
                        issues={verificationIssues.get(selected.id) ?? []}
                        onNavigate={setSelectedId}
                        onCompare={openCompare}
                        onMerged={handleVerificationMerged}
                      />
                    }
                  />
                ) : view === 'compare' ? (
                  <ComparePanel
                    client={client}
                    persons={persons}
                    selected={selected}
                    initialRightId={compareTarget}
                  />
                ) : view === 'relations' ? (
                  <RelationshipPanel
                    client={client}
                    persons={persons}
                    selected={selected}
                    onNavigate={setSelectedId}
                  />
                ) : !selected ? (
                  <div className="empty-state">
                    <img src={appIcon} alt="" width="56" height="56" />
                    {persons.length === 0 ? (
                      <>
                        <div className="empty-state__eyebrow">
                          {t('shell.startAssistant', 'Assistant de départ')}
                        </div>
                        <h2>{t('shell.readyProfile', 'Profil prêt, arbre vide')}</h2>
                        <p>
                          {t(
                            'shell.startIntro',
                            'Commencez par la personne centrale de votre arbre : vous-même, un parent ou un ancêtre connu. Ensuite, les liens, dates et vérifications s’assemblent automatiquement.',
                          )}
                        </p>
                        <ol
                          className="assistant-steps"
                          aria-label={t('shell.startSteps', 'Étapes pour commencer')}
                        >
                          <li>
                            <strong>{t('shell.step1', '1. Ajouter une personne')}</strong>
                            <span>
                              {t(
                                'shell.step1Hint',
                                'Commencez par la racine de votre histoire familiale.',
                              )}
                            </span>
                          </li>
                          <li>
                            <strong>{t('shell.step2', '2. Compléter la fiche')}</strong>
                            <span>
                              {t(
                                'shell.step2Hint',
                                'Dates, lieux, événements et liens entre proches.',
                              )}
                            </span>
                          </li>
                          <li>
                            <strong>{t('shell.step3', '3. Vérifier l’arbre')}</strong>
                            <span>
                              {t(
                                'shell.step3Hint',
                                'Les contrôles de cohérence vous guident ensuite.',
                              )}
                            </span>
                          </li>
                        </ol>
                        <div className="empty-state__actions">
                          <Button onClick={() => setCreatingOpen(true)}>
                            {t('shell.addFirstPerson', 'Ajouter la première personne')}
                          </Button>
                          <Button variant="secondary" onClick={() => setView('gedcom')}>
                            {t('shell.importGedcom', 'Importer un fichier GEDCOM')}
                          </Button>
                          <Button variant="secondary" onClick={() => setView('backups')}>
                            {t('shell.restoreBackup', 'Restaurer une sauvegarde')}
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <h2>{t('shell.choosePerson', 'Choisissez une personne')}</h2>
                        <p className="notice">
                          {t(
                            'shell.choosePersonHint',
                            'Sélectionnez une personne dans la liste ou avec la recherche rapide (Ctrl+K) pour afficher son arbre.',
                          )}
                        </p>
                      </>
                    )}
                  </div>
                ) : !relations ? (
                  <p role="status" className="loading-line">
                    {t('shell.loadingRelations', 'Chargement des relations…')}
                  </p>
                ) : (
                  <TreeExplorer
                    client={client}
                    refreshKey={dataVersion}
                    issues={verificationIssues}
                    lifespans={lifespans}
                    defaultMode={settings.treeMode}
                    defaultDepth={settings.treeDepth}
                    showSosa={settings.showSosa}
                    selected={selected}
                    onSelect={setSelectedId}
                    familyView={
                      <div className="tree-layout">
                        <div className="tree-row">
                          {relations.parents.map((person) => (
                            <PersonCard
                              key={person.id}
                              person={person}
                              selected={false}
                              onSelect={setSelectedId}
                            />
                          ))}
                        </div>
                        {relations.parents.length > 0 ? (
                          <div className="tree-connector" aria-hidden="true" />
                        ) : null}
                        <div className="tree-row tree-row--focus">
                          <PersonCard person={selected} selected onSelect={setSelectedId} />
                          {relations.spouses.map((person) => (
                            <PersonCard
                              key={person.id}
                              person={person}
                              selected={false}
                              onSelect={setSelectedId}
                            />
                          ))}
                        </div>
                        {relations.children.length > 0 ? (
                          <div className="tree-connector" aria-hidden="true" />
                        ) : null}
                        <div className="tree-row">
                          {relations.children.map((person) => (
                            <PersonCard
                              key={person.id}
                              person={person}
                              selected={false}
                              onSelect={setSelectedId}
                            />
                          ))}
                        </div>
                        <TreeLegend />
                      </div>
                    }
                  />
                )}
              </div>
            </section>

            {settings.showInspector ? <InspectorResizer /> : null}

            {settings.showInspector ? (
              <aside className="details-panel" aria-labelledby="person-title">
                {selected ? (
                  <>
                    <div className="details-panel__top">
                      <span className="avatar" aria-hidden="true">
                        <Icon name="person" />
                      </span>
                      <div>
                        <p className="eyebrow">{t('shell.selectedPerson')}</p>
                        <h2 id="person-title">{personLabel(selected)}</h2>
                        <p className="data-id">
                          {lifespans.get(selected.id)?.label ?? t('shell.unknownDates')} · #
                          {selected.id}
                        </p>
                      </div>
                    </div>
                    {settings.inspectorSections.includes('actions') ? (
                      <div className="inspector-actions">
                        <Button size="sm" onClick={() => setView('person')}>
                          {t('shell.openRecord', 'Ouvrir la fiche')}
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setView('relations')}>
                          {t('shell.openRelations', 'Ouvrir la parenté')}
                        </Button>
                      </div>
                    ) : null}
                    {relations && settings.inspectorSections.includes('relations') ? (
                      <div className="detail-section">
                        <h3>{t('shell.relations', 'Relations')}</h3>
                        <dl className="inspector-relations">
                          {[
                            ['shell.parents', 'Parents', relations.parents],
                            ['shell.spouses', 'Conjoints', relations.spouses],
                            ['shell.children', 'Enfants', relations.children],
                            ['shell.siblings', 'Fratrie', relations.siblings],
                          ].map(([key, label, list]) => (
                            <div key={key}>
                              <dt>{t(key, label)}</dt>
                              <dd>
                                {list.length}
                                {list.length > 0 ? (
                                  <span className="inspector-relations__names">
                                    {list.map((relative) => (
                                      <button
                                        key={relative.id}
                                        type="button"
                                        className="link-button link-button--small"
                                        onClick={() => setSelectedId(relative.id)}
                                      >
                                        {personLabel(relative)}
                                      </button>
                                    ))}
                                  </span>
                                ) : null}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    ) : null}
                    <VerificationSection
                      anchorId="verification-section"
                      selected={selected}
                      issues={verificationIssues.get(selected.id) ?? []}
                      onNavigate={setSelectedId}
                      onCompare={openCompare}
                      onMerged={handleVerificationMerged}
                    />
                    {settings.inspectorSections.includes('quality') ? (
                      <QualityCard
                        client={client}
                        personId={selected.id}
                        version={`${dataVersion}-${lifespans.size}-${history.undoLabel ?? ''}`}
                        onOpenCoherence={() =>
                          document
                            .getElementById('verification-section')
                            ?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })
                        }
                        onOpenSources={() => setView('sources')}
                      />
                    ) : null}
                    {settings.inspectorSections.includes('identity') ? (
                      <details className="inspector-edit">
                        <summary>{t('shell.editIdentity', 'Modifier l’identité')}</summary>
                        <IdentityTool selected={selected} onUpdated={loadPersons} />
                      </details>
                    ) : null}
                  </>
                ) : (
                  <p className="notice">
                    {t('shell.noPersonSelected', 'Aucune personne sélectionnée.')}
                  </p>
                )}
              </aside>
            ) : null}
          </section>
        </main>
      </VerificationContext.Provider>
    </LifespanContext.Provider>
  );
}

function App() {
  return (
    <SettingsProvider>
      <AppContent />
    </SettingsProvider>
  );
}

export default App;
