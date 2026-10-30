import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { renderWithProviders, screen } from '../test/test-utils.jsx';
import { CitationEditForm } from './CitationEditForm.jsx';

describe('CitationEditForm', () => {
  it('renvoie la source et la citation modifiées', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    const { container } = renderWithProviders(
      <CitationEditForm
        citation={{ id: 1, page: '12', confidence: 'LOW' }}
        source={{ title: 'Registre', author: null, source_kind: 'UNKNOWN' }}
        busy={false}
        onSave={onSave}
        onCancel={() => {}}
      />,
    );
    await user.selectOptions(screen.getByLabelText('Nature de la source'), 'ORIGINAL');
    await user.selectOptions(screen.getByLabelText('Niveau de confiance'), 'HIGH');
    await user.clear(screen.getByLabelText('Page ou référence'));
    await user.type(screen.getByLabelText('Page ou référence'), '14');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(onSave).toHaveBeenCalledWith({
      source: { title: 'Registre', author: null, sourceKind: 'ORIGINAL' },
      citation: {
        page: '14',
        quotation: null,
        confidence: 'HIGH',
        evidenceType: 'UNKNOWN',
        informationQuality: 'UNKNOWN',
      },
    });
    expect(await axe(container)).toHaveNoViolations();
  });

  it('refuse un titre vide', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <CitationEditForm
        citation={{ id: 1 }}
        source={{ title: '' }}
        onSave={onSave}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
    await user.type(screen.getByLabelText('Titre de la source'), 'X');
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled();
  });
});
