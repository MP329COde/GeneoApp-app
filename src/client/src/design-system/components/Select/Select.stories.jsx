import { Select } from './Select.jsx';

const options = [
  { value: 'fr', label: 'France' },
  { value: 'be', label: 'Belgique' },
  { value: 'ch', label: 'Suisse' },
];

export default {
  title: 'Design System/Select',
  component: Select,
  args: {
    label: 'Pays',
    options,
  },
};

export const Default = {};

export const Required = { args: { required: true } };

export const WithError = {
  args: { error: 'Veuillez sélectionner un pays.', required: true },
};
