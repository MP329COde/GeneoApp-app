import { TextField } from './TextField.jsx';

export default {
  title: 'Design System/TextField',
  component: TextField,
  args: {
    label: 'Nom',
    placeholder: 'Saisissez votre nom',
  },
};

export const Default = {};

export const Required = { args: { required: true } };

export const WithHint = { args: { hint: "Tel qu'il apparaît sur vos documents officiels." } };

export const WithError = {
  args: { error: 'Ce champ est obligatoire.', required: true },
};
