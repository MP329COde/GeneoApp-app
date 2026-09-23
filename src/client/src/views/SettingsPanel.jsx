import { Button, LanguageSwitcher, useI18n } from '../design-system/index.js';
import {
  ALWAYS_VISIBLE_VIEWS,
  INSPECTOR_SECTIONS,
  PERSON_TAB_IDS,
  useSettings,
} from '../settings/SettingsContext.jsx';

const ACCENT_CHOICES = [
  ['blue', 'Bleu archives', '#1a5b9e'],
  ['teal', 'Sarcelle', '#1a6668'],
  ['green', 'Vert', '#1e6b47'],
  ['slate', 'Ardoise', '#3d5a73'],
  ['ink', 'Encre', '#2c3a42'],
];
const SECTION_LABELS = {
  actions: 'Boutons d’action',
  relations: 'Relations',
  quality: 'Qualité des données',
  identity: 'Modifier l’identité',
};
const TAB_LABELS = {
  identity: 'Identité',
  events: 'Événements',
  sources: 'Sources',
  media: 'Médias',
  notes: 'Notes',
  timeline: 'Chronologie',
  history: 'Historique',
};

function toggleIn(list, id, on) {
  return on ? [...new Set([...list, id])] : list.filter((item) => item !== id);
}

// Menu : afficher / masquer, réordonner (↑ ↓) et vue d'accueil.
function MenuCustomizer({ navGroups, settings, update, t }) {
  const allIds = navGroups.flatMap((group) => group.items.map((item) => item.id));
  const ordered = (group) =>
    [...group.items].sort((a, b) => {
      const rank = (id) => {
        const index = settings.navOrder.indexOf(id);
        return index >= 0 ? index : 1000 + allIds.indexOf(id);
      };
      return rank(a.id) - rank(b.id);
    });
  const move = (group, id, delta) => {
    const items = ordered(group).map((item) => item.id);
    const index = items.indexOf(id);
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target], items[index]];
    // L'ordre global conserve celui des autres groupes.
    const others = settings.navOrder.filter((other) => !items.includes(other));
    update({ navOrder: [...others, ...items] });
  };
  return (
    <>
      <label className="settings-field">
        <span>Vue d’accueil</span>
        <select
          value={settings.homeView}
          onChange={(event) => update({ homeView: event.target.value })}
        >
          {navGroups.flatMap((group) =>
            group.items
              .filter((item) => !settings.hiddenViews.includes(item.id))
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {t(`nav.${item.id}`, item.label)}
                </option>
              )),
          )}
        </select>
      </label>
      {navGroups.map((group) => (
        <fieldset key={group.key} className="menu-customizer">
          <legend>{t(`nav.group.${group.key}`, group.label)}</legend>
          <ul>
            {ordered(group).map((item, index, list) => {
              const label = t(`nav.${item.id}`, item.label);
              const locked = ALWAYS_VISIBLE_VIEWS.includes(item.id);
              return (
                <li key={item.id}>
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={!settings.hiddenViews.includes(item.id)}
                      disabled={locked}
                      onChange={(event) =>
                        update({
                          hiddenViews: toggleIn(
                            settings.hiddenViews,
                            item.id,
                            !event.target.checked,
                          ),
                        })
                      }
                    />
                    <span>
                      {label}
                      {locked ? <small className="settings-hint"> (toujours affiché)</small> : null}
                    </span>
                  </label>
                  <span className="menu-customizer__move">
                    <button
                      type="button"
                      aria-label={`Monter ${label}`}
                      disabled={index === 0}
                      onClick={() => move(group, item.id, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={`Descendre ${label}`}
                      disabled={index === list.length - 1}
                      onClick={() => move(group, item.id, 1)}
                    >
                      ↓
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </fieldset>
      ))}
    </>
  );
}

function Choice({ legend, name, value, options, onChange, hint }) {
  return (
    <fieldset className="settings-choice">
      <legend>{legend}</legend>
      {hint ? <p className="settings-hint">{hint}</p> : null}
      <div className="settings-choice__options">
        {options.map((option) => (
          <label key={option.value} className="settings-option">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Toggle({ label, checked, onChange, hint }) {
  return (
    <label className="settings-toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        {label}
        {hint ? <small className="settings-hint">{hint}</small> : null}
      </span>
    </label>
  );
}

// Paramètres de l'application : apparence, accessibilité, arbre, comportement.
export function SettingsPanel({ navGroups = [] }) {
  const { settings, update, reset } = useSettings();
  const { t } = useI18n();

  return (
    <div className="search-panel settings-panel">
      <h3>{t('settings.title')}</h3>

      <section aria-labelledby="settings-appearance">
        <h4 id="settings-appearance">{t('settings.appearance')}</h4>
        <Choice
          legend={t('settings.theme')}
          name="theme"
          value={settings.theme}
          onChange={(theme) => update({ theme })}
          options={[
            { value: 'system', label: t('settings.theme.system') },
            { value: 'light', label: t('settings.theme.light') },
            { value: 'dark', label: t('settings.theme.dark') },
          ]}
        />
        <div className="theme-previews" aria-hidden="true">
          <span className="theme-preview theme-preview--light">
            <span className="theme-preview__name">Marie Duchamp</span>
            <span className="theme-preview__date">03 MAR 1788</span>
          </span>
          <span className="theme-preview theme-preview--dark">
            <span className="theme-preview__name">Marie Duchamp</span>
            <span className="theme-preview__date">03 MAR 1788</span>
          </span>
        </div>
        <Choice
          legend={t('settings.density')}
          name="density"
          value={settings.density}
          onChange={(density) => update({ density })}
          options={[
            { value: 'compact', label: t('settings.density.compact') },
            { value: 'standard', label: t('settings.density.standard') },
            { value: 'comfortable', label: t('settings.density.comfortable') },
          ]}
        />
        <div className="settings-field">
          <LanguageSwitcher />
        </div>
      </section>

      <section aria-labelledby="settings-accent">
        <h4 id="settings-accent">Couleur d’accent</h4>
        <fieldset className="settings-choice">
          <legend>Couleur des actions et de la sélection</legend>
          <div className="settings-choice__options">
            {ACCENT_CHOICES.map(([value, label, swatch]) => (
              <label key={value} className="settings-option">
                <input
                  type="radio"
                  name="accent"
                  value={value}
                  checked={settings.accent === value}
                  onChange={() => update({ accent: value })}
                />
                <span className="accent-swatch" style={{ background: swatch }} aria-hidden="true" />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <section aria-labelledby="settings-panels">
        <h4 id="settings-panels">Panneaux</h4>
        <label className="settings-toggle">
          <input
            type="checkbox"
            checked={settings.showInspector}
            onChange={(event) => update({ showInspector: event.target.checked })}
          />
          <span>Afficher le panneau de la personne (à droite)</span>
        </label>
        <label className="settings-field">
          <span>Largeur du panneau de la personne : {settings.inspectorWidth} px</span>
          <input
            type="range"
            min="280"
            max="520"
            step="10"
            value={settings.inspectorWidth}
            onChange={(event) => update({ inspectorWidth: Number(event.target.value) })}
          />
        </label>
        <label className="settings-field">
          <span>Largeur du menu : {settings.sidebarWidth} px</span>
          <input
            type="range"
            min="200"
            max="360"
            step="8"
            value={settings.sidebarWidth}
            onChange={(event) => update({ sidebarWidth: Number(event.target.value) })}
          />
        </label>
      </section>

      <section aria-labelledby="settings-menu">
        <h4 id="settings-menu">Menu</h4>
        <MenuCustomizer navGroups={navGroups} settings={settings} update={update} t={t} />
      </section>

      <section aria-labelledby="settings-sheet">
        <h4 id="settings-sheet">Fiche personne</h4>
        <fieldset className="settings-choice">
          <legend>Sections du panneau de la personne</legend>
          <div className="settings-choice__options">
            {INSPECTOR_SECTIONS.map((id) => (
              <label key={id} className="settings-toggle">
                <input
                  type="checkbox"
                  checked={settings.inspectorSections.includes(id)}
                  onChange={(event) =>
                    update({
                      inspectorSections: toggleIn(
                        settings.inspectorSections,
                        id,
                        event.target.checked,
                      ),
                    })
                  }
                />
                <span>{SECTION_LABELS[id]}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="settings-choice">
          <legend>Onglets de la fiche</legend>
          <div className="settings-choice__options">
            {PERSON_TAB_IDS.map((id) => (
              <label key={id} className="settings-toggle">
                <input
                  type="checkbox"
                  checked={settings.personTabs.includes(id)}
                  disabled={id === 'identity'}
                  onChange={(event) =>
                    update({ personTabs: toggleIn(settings.personTabs, id, event.target.checked) })
                  }
                />
                <span>{TAB_LABELS[id]}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <section aria-labelledby="settings-a11y">
        <h4 id="settings-a11y">{t('settings.a11y')}</h4>
        <Choice
          legend={t('settings.textSize')}
          name="textSize"
          value={settings.textSize}
          onChange={(textSize) => update({ textSize })}
          options={[
            { value: 'standard', label: t('settings.textSize.standard') },
            { value: 'large', label: t('settings.textSize.large') },
            { value: 'xlarge', label: t('settings.textSize.xlarge') },
          ]}
        />
        <Choice
          legend={t('settings.motion')}
          name="reduceMotion"
          value={settings.reduceMotion}
          onChange={(reduceMotion) => update({ reduceMotion })}
          options={[
            { value: 'system', label: t('settings.motion.system') },
            { value: 'reduce', label: t('settings.motion.reduce') },
            { value: 'allow', label: t('settings.motion.allow') },
          ]}
        />
        <Toggle
          label={t('settings.shortcuts')}
          checked={settings.showShortcuts}
          onChange={(showShortcuts) => update({ showShortcuts })}
        />
      </section>

      <section aria-labelledby="settings-tree">
        <h4 id="settings-tree">{t('settings.tree')}</h4>
        <Choice
          legend={t('settings.treeMode')}
          name="treeMode"
          value={settings.treeMode}
          onChange={(treeMode) => update({ treeMode })}
          options={[
            { value: 'family', label: t('tree.family') },
            { value: 'ancestors', label: t('tree.ancestors') },
            { value: 'descendants', label: t('tree.descendants') },
            { value: 'fan', label: t('tree.fan') },
          ]}
        />
        <label className="settings-field">
          <span>{t('settings.treeDepth')}</span>
          <input
            type="number"
            min="1"
            max="30"
            value={settings.treeDepth}
            onChange={(event) => update({ treeDepth: Number(event.target.value) })}
          />
        </label>
        <Toggle
          label={t('settings.showSosa')}
          checked={settings.showSosa}
          onChange={(showSosa) => update({ showSosa })}
        />
      </section>

      <p className="settings-hint">{t('settings.localOnly')}</p>
      <Button variant="secondary" onClick={reset}>
        {t('settings.reset')}
      </Button>
    </div>
  );
}
