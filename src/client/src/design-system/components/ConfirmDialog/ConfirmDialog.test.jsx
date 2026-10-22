import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { renderWithProviders, screen } from '../../../test/test-utils.jsx';
import { ConfirmDialog } from './ConfirmDialog.jsx';

function ConfirmDialogHarness({ onConfirm, onCancel }) {
  const [isOpen, setOpen] = useState(false);

  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Supprimer
      </button>
      <ConfirmDialog
        isOpen={isOpen}
        title="Dissoudre / supprimer l’union"
        message="Dissoudre / supprimer cette union ? Cette action est irréversible."
        onConfirm={() => {
          setOpen(false);
          onConfirm?.();
        }}
        onCancel={() => {
          setOpen(false);
          onCancel?.();
        }}
      />
    </div>
  );
}

describe('ConfirmDialog', () => {
  it('s’ouvre en rôle alertdialog avec le message annoncé', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConfirmDialogHarness />);

    await user.click(screen.getByRole('button', { name: 'Supprimer' }));

    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription(
      'Dissoudre / supprimer cette union ? Cette action est irréversible.',
    );
  });

  it('place le focus sur le bouton d’annulation', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConfirmDialogHarness />);

    await user.click(screen.getByRole('button', { name: 'Supprimer' }));
    expect(screen.getByRole('button', { name: 'Annuler' })).toHaveFocus();
  });

  it('confirme l’action au clic sur « Confirmer »', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    renderWithProviders(<ConfirmDialogHarness onConfirm={onConfirm} />);

    await user.click(screen.getByRole('button', { name: 'Supprimer' }));
    await user.click(screen.getByRole('button', { name: 'Confirmer' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('annule l’action au clic sur « Annuler » et avec Échap', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    renderWithProviders(<ConfirmDialogHarness onCancel={onCancel} />);

    await user.click(screen.getByRole('button', { name: 'Supprimer' }));
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Supprimer' }));
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('restaure le focus sur le déclencheur à la fermeture', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConfirmDialogHarness />);

    const trigger = screen.getByRole('button', { name: 'Supprimer' });
    await user.click(trigger);
    await user.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
  });

  it("n'a aucune violation d'accessibilité détectée par axe", async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<ConfirmDialogHarness />);
    await user.click(screen.getByRole('button', { name: 'Supprimer' }));

    expect(await axe(container)).toHaveNoViolations();
  });
});
