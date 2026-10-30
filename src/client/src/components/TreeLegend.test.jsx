import { describe, expect, it } from 'vitest';
import { renderWithProviders, screen } from '../test/test-utils.jsx';
import { TreeLegend } from './TreeLegend.jsx';

describe('Légende de l’arbre', () => {
  it('se présente en français', () => {
    renderWithProviders(<TreeLegend />, { locale: 'fr' });

    expect(screen.getByLabelText('Légende')).toBeInTheDocument();
    expect(screen.getByText('Biologique')).toBeInTheDocument();
    expect(screen.getByText('Adoptive')).toBeInTheDocument();
    expect(screen.getByText('Inconnue')).toBeInTheDocument();
  });

  it('se présente en anglais', () => {
    renderWithProviders(<TreeLegend />, { locale: 'en' });

    expect(screen.getByLabelText('Legend')).toBeInTheDocument();
    expect(screen.getByText('Biological')).toBeInTheDocument();
    expect(screen.getByText('Adoptive')).toBeInTheDocument();
    expect(screen.getByText('Unknown')).toBeInTheDocument();
    expect(screen.queryByText('Biologique')).not.toBeInTheDocument();
  });
});
