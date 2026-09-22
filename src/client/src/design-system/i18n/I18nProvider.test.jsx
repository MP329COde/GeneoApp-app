import { describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, screen } from '../../test/test-utils.jsx';
import { LanguageSwitcher } from '../components/LanguageSwitcher/LanguageSwitcher.jsx';
import { Button } from '../components/Button/Button.jsx';

describe('I18nProvider / changement de langue', () => {
  it('met à jour les textes traduits quand la langue change', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <LanguageSwitcher />
        <Button loading>Enregistrer</Button>
      </>,
    );

    expect(screen.getByText('Chargement en cours')).toBeInTheDocument();

    const select = screen.getByLabelText('Langue');
    await user.selectOptions(select, 'en');

    expect(screen.getByText('Loading')).toBeInTheDocument();
    expect(screen.queryByText('Chargement en cours')).not.toBeInTheDocument();
  });
});
