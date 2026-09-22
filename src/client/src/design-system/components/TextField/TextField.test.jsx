import { describe, expect, it } from 'vitest';
import { axe } from 'jest-axe';
import { renderWithProviders, screen } from '../../../test/test-utils.jsx';
import { TextField } from './TextField.jsx';

describe('TextField', () => {
  it('associe le label au champ via htmlFor/id', () => {
    renderWithProviders(<TextField label="Nom" />);
    expect(screen.getByLabelText(/nom/i)).toBeInTheDocument();
  });

  it("expose l'erreur via aria-describedby et role=alert", () => {
    renderWithProviders(<TextField label="Nom" error="Champ requis" required />);

    const input = screen.getByLabelText(/nom/i);
    const error = screen.getByRole('alert');

    expect(error).toHaveTextContent('Champ requis');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby')).toContain(error.id);
  });

  it("n'a aucune violation d'accessibilité détectée par axe", async () => {
    const { container } = renderWithProviders(
      <TextField label="Nom" hint="Indication" error="Erreur" required />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
