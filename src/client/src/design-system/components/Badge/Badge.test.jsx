import { describe, expect, it } from 'vitest';
import { axe } from 'jest-axe';
import { renderWithProviders, screen } from '../../../test/test-utils.jsx';
import { Badge } from './Badge.jsx';

describe('Badge', () => {
  it('affiche le texte de statut (information non portée par la seule couleur)', () => {
    renderWithProviders(<Badge tone="success">Validé</Badge>);
    expect(screen.getByText('Validé')).toBeInTheDocument();
  });

  it("n'a aucune violation d'accessibilité détectée par axe", async () => {
    const { container } = renderWithProviders(<Badge tone="danger">Erreur</Badge>);
    expect(await axe(container)).toHaveNoViolations();
  });
});
