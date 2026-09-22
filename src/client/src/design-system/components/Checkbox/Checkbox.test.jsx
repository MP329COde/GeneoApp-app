import { describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { renderWithProviders, screen } from '../../../test/test-utils.jsx';
import { Checkbox } from './Checkbox.jsx';

describe('Checkbox', () => {
  it("bascule d'état à l'activation clavier (Espace)", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Checkbox label="Accepter" />);

    const checkbox = screen.getByRole('checkbox', { name: 'Accepter' });
    await user.tab();
    expect(checkbox).toHaveFocus();

    await user.keyboard(' ');
    expect(checkbox).toBeChecked();
  });

  it("n'a aucune violation d'accessibilité détectée par axe", async () => {
    const { container } = renderWithProviders(<Checkbox label="Accepter" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
