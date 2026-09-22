import { render } from '@testing-library/react';
import { I18nProvider } from '../design-system/i18n/I18nProvider.jsx';

export function renderWithProviders(ui, { locale, ...options } = {}) {
  return render(<I18nProvider defaultLocale={locale}>{ui}</I18nProvider>, options);
}

export * from '@testing-library/react';
