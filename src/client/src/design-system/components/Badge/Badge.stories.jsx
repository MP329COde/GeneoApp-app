import { Badge, BADGE_TONES } from './Badge.jsx';

export default {
  title: 'Design System/Badge',
  component: Badge,
  argTypes: {
    tone: { control: 'select', options: BADGE_TONES },
  },
  args: {
    tone: 'neutral',
    children: 'Statut',
  },
};

export const Neutral = {};

export const Success = { args: { tone: 'success', children: 'Validé' } };

export const Danger = { args: { tone: 'danger', children: 'Erreur' } };
