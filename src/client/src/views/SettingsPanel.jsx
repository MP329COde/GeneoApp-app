import { Button, LanguageSwitcher, useI18n } from '../design-system/index.js';
import { useSettings } from '../settings/SettingsContext.jsx';

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
export function SettingsPanel() {
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
