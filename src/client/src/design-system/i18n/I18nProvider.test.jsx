import { describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, screen } from '../../test/test-utils.jsx';
import { LanguageSwitcher } from '../components/LanguageSwitcher/LanguageSwitcher.jsx';
import { Button } from '../components/Button/Button.jsx';
import { translate } from './I18nProvider.jsx';

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

describe('translate() : pluriels et formatage des nombres', () => {
  it('accorde le singulier/pluriel réel (pas de suffixe "(s)") et sépare les milliers', () => {
    // 0 et 1 sont "one" en français (Intl.PluralRules), donc singulier correct.
    expect(translate('fr', 'shell.personCount', { count: 0 })).toBe('0 personne');
    expect(translate('fr', 'shell.personCount', { count: 1 })).toBe('1 personne');
    expect(translate('fr', 'shell.personCount', { count: 2 })).toBe('2 personnes');
    expect(translate('fr', 'shell.personCount', { count: 1375 })).toBe('1 375 personnes');
  });

  it('bascule sur la règle de pluriel anglaise pour la locale en', () => {
    expect(translate('en', 'shell.personCount', { count: 0 })).toBe('0 people');
    expect(translate('en', 'shell.personCount', { count: 1 })).toBe('1 person');
    expect(translate('en', 'shell.personCount', { count: 2 })).toBe('2 people');
  });
});
