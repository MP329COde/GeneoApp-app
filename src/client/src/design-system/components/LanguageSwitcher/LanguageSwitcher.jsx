import { useId } from 'react';
import { SUPPORTED_LOCALES, languageName, useI18n } from '../../i18n/I18nProvider.jsx';
import './LanguageSwitcher.css';

/**
 * Change la langue de toute l'application. Utilise un `select` natif :
 * pleinement clavier-accessible et déjà annoncé correctement par les
 * lecteurs d'écran, sans widget personnalisé à maintenir.
 */
export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
  const fieldId = useId();

  return (
    <div className="gds-language-switcher">
      <label htmlFor={fieldId} className="gds-language-switcher__label">
        {t('languageSwitcher.label')}
      </label>
      <select
        id={fieldId}
        className="gds-language-switcher__select"
        value={locale}
        onChange={(event) => setLocale(event.target.value)}
      >
        {SUPPORTED_LOCALES.map((code) => (
          <option key={code} value={code}>
            {languageName(code)}
          </option>
        ))}
      </select>
    </div>
  );
}
