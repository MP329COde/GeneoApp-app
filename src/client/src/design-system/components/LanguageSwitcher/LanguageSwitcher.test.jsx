import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { render } from '@testing-library/react';
import { renderWithProviders, screen } from '../../../test/test-utils.jsx';
import { I18nProvider } from '../../i18n/I18nProvider.jsx';
import { LanguageSwitcher } from './LanguageSwitcher.jsx';

describe('LanguageSwitcher', () => {
  it('affiche la locale courante et ses options', () => {
    renderWithProviders(<LanguageSwitcher />, { locale: 'fr' });

    const select = screen.getByLabelText('Langue');
    expect(select).toHaveValue('fr');
    expect(screen.getByRole('option', { name: 'Français' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'English' })).toBeInTheDocument();
  });

  it('change la langue au clavier et prévient le parent', async () => {
    const user = userEvent.setup();
    const handleLocaleChange = vi.fn();
    render(
      <I18nProvider defaultLocale="fr" onLocaleChange={handleLocaleChange}>
        <LanguageSwitcher />
      </I18nProvider>,
    );

    const select = screen.getByLabelText('Langue');
    await user.selectOptions(select, 'en');

    expect(handleLocaleChange).toHaveBeenCalledWith('en');
    expect(screen.getByLabelText('Language')).toHaveValue('en');
  });

  it("n'a aucune violation d'accessibilité détectée par axe", async () => {
    const { container } = renderWithProviders(<LanguageSwitcher />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
