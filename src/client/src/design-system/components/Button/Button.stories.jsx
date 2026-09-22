import { Button, BUTTON_VARIANTS, BUTTON_SIZES } from './Button.jsx';

export default {
  title: 'Design System/Button',
  component: Button,
  argTypes: {
    variant: { control: 'select', options: BUTTON_VARIANTS },
    size: { control: 'select', options: BUTTON_SIZES },
  },
  args: {
    children: 'Valider',
    variant: 'primary',
    size: 'md',
  },
};

export const Primary = {};

export const Secondary = { args: { variant: 'secondary' } };

export const Danger = { args: { variant: 'danger', children: 'Supprimer' } };

export const Loading = { args: { loading: true, children: 'Enregistrer' } };

export const Disabled = { args: { disabled: true, children: 'Indisponible' } };
