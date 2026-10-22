import { useState } from 'react';
import { ConfirmDialog } from './ConfirmDialog.jsx';
import { Button } from '../Button/Button.jsx';

export default {
  title: 'Design System/ConfirmDialog',
  component: ConfirmDialog,
};

function Demo({ busy = false }) {
  const [isOpen, setOpen] = useState(true);
  return (
    <div>
      <Button onClick={() => setOpen(true)}>Supprimer la personne</Button>
      <ConfirmDialog
        isOpen={isOpen}
        title="Supprimer la personne"
        message="La personne sera placée dans la corbeille. Vous pourrez la restaurer."
        confirmLabel="Supprimer"
        isBusy={busy}
        onConfirm={() => setOpen(false)}
        onCancel={() => setOpen(false)}
      />
    </div>
  );
}

export const Default = { render: () => <Demo /> };
export const EnCours = { render: () => <Demo busy /> };
