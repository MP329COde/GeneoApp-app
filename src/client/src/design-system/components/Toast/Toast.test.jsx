import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n/I18nProvider.jsx';
import { EmptyState } from '../EmptyState/EmptyState.jsx';
import { SkeletonGroup } from '../Skeleton/Skeleton.jsx';
import { ToastProvider, useToast } from './Toast.jsx';

function Trigger() {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast.show('Enregistré', { tone: 'success' })}>
      go
    </button>
  );
}

describe('Toast', () => {
  afterEach(() => vi.useRealTimers());

  it('annonce le message dans une région de statut puis le retire seul', () => {
    vi.useFakeTimers();
    render(
      <I18nProvider>
        <ToastProvider>
          <Trigger />
        </ToastProvider>
      </I18nProvider>,
    );
    fireEvent.click(screen.getByText('go'));
    expect(screen.getByRole('status')).toHaveTextContent('Enregistré');
    act(() => vi.advanceTimersByTime(6000));
    expect(screen.queryByText('Enregistré')).not.toBeInTheDocument();
  });

  it('se ferme au clic sur le bouton de fermeture', () => {
    render(
      <I18nProvider>
        <ToastProvider>
          <Trigger />
        </ToastProvider>
      </I18nProvider>,
    );
    fireEvent.click(screen.getByText('go'));
    fireEvent.click(screen.getByRole('button', { name: 'Fermer la notification' }));
    expect(screen.queryByText('Enregistré')).not.toBeInTheDocument();
  });
});

describe('EmptyState et Skeleton', () => {
  it('affiche titre, explication et action', () => {
    render(
      <EmptyState title="Rien ici" actions={<button type="button">Ajouter</button>}>
        Commencez par ajouter une personne.
      </EmptyState>,
    );
    expect(screen.getByText('Rien ici')).toBeInTheDocument();
    expect(screen.getByText('Commencez par ajouter une personne.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ajouter' })).toBeInTheDocument();
  });

  it('annonce le chargement sans exposer les formes décoratives', () => {
    render(<SkeletonGroup label="Chargement…" rows={2} />);
    expect(screen.getByRole('status')).toHaveTextContent('Chargement…');
    expect(document.querySelectorAll('.gds-skeleton[aria-hidden="true"]').length).toBeGreaterThan(
      0,
    );
  });
});
