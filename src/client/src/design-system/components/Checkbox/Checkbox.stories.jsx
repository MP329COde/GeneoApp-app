import { Checkbox } from './Checkbox.jsx';

export default {
  title: 'Design System/Checkbox',
  component: Checkbox,
  args: {
    label: "J'accepte les conditions",
  },
};

export const Default = {};

export const CheckedByDefault = { args: { defaultChecked: true } };

export const Disabled = { args: { disabled: true } };
