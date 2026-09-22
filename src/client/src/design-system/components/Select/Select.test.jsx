import { describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { renderWithProviders, screen } from '../../../test/test-utils.jsx';
import { Select } from './Select.jsx';

const options = [
  { value: 'fr', label: 'France' },
  { value: 'be', label: 'Belgique' },
];

describe('Select', () => {
  it('permet de choisir une option au clavier', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Select label="Pays" options={options} />);

    const select = screen.getByLabelText(/pays/i);
    await user.selectOptions(select, 'be');

    expect(select).toHaveValue('be');
  });

  it("n'a aucune violation d'accessibilité détectée par axe", async () => {
    const { container } = renderWithProviders(
      <Select label="Pays" options={options} error="Choix requis" required />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
