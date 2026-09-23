import { Button, LanguageSwitcher } from '../design-system/index.js';
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

  return (
    <div className="search-panel settings-panel">
      <h3>Paramètres</h3>

      <section aria-labelledby="settings-appearance">
        <h4 id="settings-appearance">Apparence</h4>
        <Choice
          legend="Thème"
          name="theme"
          value={settings.theme}
          onChange={(theme) => update({ theme })}
          options={[
            { value: 'system', label: 'Suivre le système' },
            { value: 'light', label: 'Clair — Papier' },
            { value: 'dark', label: 'Sombre — Salle d’archives' },
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
          legend="Densité"
          name="density"
          value={settings.density}
          onChange={(density) => update({ density })}
          options={[
            { value: 'compact', label: 'Compacte' },
            { value: 'standard', label: 'Standard' },
            { value: 'comfortable', label: 'Confortable' },
          ]}
        />
        <div className="settings-field">
          <LanguageSwitcher />
        </div>
      </section>

      <section aria-labelledby="settings-a11y">
        <h4 id="settings-a11y">Accessibilité</h4>
        <Choice
          legend="Taille du texte"
          name="textSize"
          value={settings.textSize}
          onChange={(textSize) => update({ textSize })}
          options={[
            { value: 'standard', label: 'Standard' },
            { value: 'large', label: 'Grande' },
            { value: 'xlarge', label: 'Très grande' },
          ]}
        />
        <Choice
          legend="Animations"
          name="reduceMotion"
          value={settings.reduceMotion}
          onChange={(reduceMotion) => update({ reduceMotion })}
          options={[
            { value: 'system', label: 'Suivre le système' },
            { value: 'reduce', label: 'Réduire' },
            { value: 'allow', label: 'Autoriser' },
          ]}
        />
        <Toggle
          label="Afficher les raccourcis clavier dans la navigation"
          checked={settings.showShortcuts}
          onChange={(showShortcuts) => update({ showShortcuts })}
        />
      </section>

      <section aria-labelledby="settings-tree">
        <h4 id="settings-tree">Arbre</h4>
        <Choice
          legend="Vue d’arbre par défaut"
          name="treeMode"
          value={settings.treeMode}
          onChange={(treeMode) => update({ treeMode })}
          options={[
            { value: 'family', label: 'Familial' },
            { value: 'ancestors', label: 'Ascendant' },
            { value: 'descendants', label: 'Descendant' },
            { value: 'fan', label: 'Éventail' },
          ]}
        />
        <label className="settings-field">
          <span>Générations affichées par défaut</span>
          <input
            type="number"
            min="1"
            max="30"
            value={settings.treeDepth}
            onChange={(event) => update({ treeDepth: Number(event.target.value) })}
          />
        </label>
        <Toggle
          label="Afficher les numéros Sosa"
          checked={settings.showSosa}
          onChange={(showSosa) => update({ showSosa })}
        />
      </section>

      <p className="settings-hint">
        Ces préférences sont enregistrées sur cet appareil uniquement.
      </p>
      <Button variant="secondary" onClick={reset}>
        Rétablir les valeurs par défaut
      </Button>
    </div>
  );
}
