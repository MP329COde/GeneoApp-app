import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { renderWithProviders, screen } from '../../../test/test-utils.jsx';
import { Modal } from './Modal.jsx';

function ModalHarness({ onClose, initiallyOpen = true }) {
  const [isOpen, setOpen] = useState(initiallyOpen);

  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Déclencheur
      </button>
      <Modal
        isOpen={isOpen}
        title="Confirmer"
        onClose={() => {
          setOpen(false);
          onClose?.();
        }}
      >
        <button type="button">Premier</button>
        <button type="button">Dernier</button>
      </Modal>
    </div>
  );
}

describe('Modal', () => {
  it('place le focus dans la boîte de dialogue à l’ouverture', () => {
    renderWithProviders(<ModalHarness />);
    expect(screen.getByRole('button', { name: /fermer/i })).toHaveFocus();
  });

  it('piège le focus (Tab depuis le dernier élément revient au premier)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ModalHarness />);

    const closeButton = screen.getByRole('button', { name: /fermer/i });
    const first = screen.getByRole('button', { name: 'Premier' });
    const last = screen.getByRole('button', { name: 'Dernier' });

    last.focus();
    await user.tab();
    expect(closeButton).toHaveFocus();

    await user.tab();
    expect(first).toHaveFocus();
  });

  it('se ferme avec la touche Échap', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(<ModalHarness onClose={onClose} />);

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('restaure le focus sur le déclencheur à la fermeture', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ModalHarness initiallyOpen={false} />);

    const trigger = screen.getByRole('button', { name: 'Déclencheur' });
    await user.click(trigger);
    expect(screen.getByRole('button', { name: /fermer/i })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
  });

  it("n'a aucune violation d'accessibilité détectée par axe", async () => {
    const { container } = renderWithProviders(<ModalHarness />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
