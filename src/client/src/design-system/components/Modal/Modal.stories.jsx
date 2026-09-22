import { useState } from 'react';
import { Modal } from './Modal.jsx';
import { Button } from '../Button/Button.jsx';

export default {
  title: 'Design System/Modal',
  component: Modal,
};

function ModalDemo() {
  const [isOpen, setOpen] = useState(false);

  return (
    <div>
      <Button onClick={() => setOpen(true)}>Ouvrir la boîte de dialogue</Button>
      <Modal isOpen={isOpen} title="Confirmer la suppression" onClose={() => setOpen(false)}>
        <p>Cette action est irréversible. Voulez-vous continuer ?</p>
        <Button variant="danger" onClick={() => setOpen(false)}>
          Confirmer
        </Button>
      </Modal>
    </div>
  );
}

export const Default = {
  render: () => <ModalDemo />,
};
