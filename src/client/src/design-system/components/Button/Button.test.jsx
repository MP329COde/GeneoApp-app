import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { renderWithProviders, screen } from '../../../test/test-utils.jsx';
import { Button } from './Button.jsx';

describe('Button', () => {
  it("déclenche onClick à l'activation clavier (Entrée/Espace)", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    renderWithProviders(<Button onClick={onClick}>Valider</Button>);

    await user.tab();
    expect(screen.getByRole('button', { name: 'Valider' })).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(1);

    await user.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('désactive le bouton et annonce le chargement quand loading est actif', () => {
    renderWithProviders(<Button loading>Enregistrer</Button>);

    const button = screen.getByRole('button', { name: /enregistrer/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Chargement en cours')).toBeInTheDocument();
  });

  it("n'a aucune violation d'accessibilité détectée par axe", async () => {
    const { container } = renderWithProviders(<Button>Valider</Button>);
    expect(await axe(container)).toHaveNoViolations();
  });
});
