import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, screen } from '../test/test-utils.jsx';
import { AnnotationsPanel } from './AnnotationsPanel.jsx';

function fakeClient() {
  return {
    notes: {
      listForEntity: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 1 }),
    },
  };
}

describe('AnnotationsPanel : texte de remplacement traduit', () => {
  it('insère le mot français quand rien n’est sélectionné', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AnnotationsPanel client={fakeClient()} entityType="PERSON" entityId={1} />,
      { locale: 'fr' },
    );

    await user.click(screen.getByRole('button', { name: 'Gras' }));

    expect(screen.getByRole('textbox', { name: 'Note' })).toHaveValue('**texte**');
  });

  it('insère le mot anglais quand rien n’est sélectionné', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AnnotationsPanel client={fakeClient()} entityType="PERSON" entityId={1} />,
      { locale: 'en' },
    );

    await user.click(screen.getByRole('button', { name: 'Bold' }));

    expect(screen.getByRole('textbox', { name: 'Note' })).toHaveValue('**text**');
  });
});
