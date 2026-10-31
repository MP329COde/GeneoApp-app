import { client } from '../api/app-client.js';
import { PortraitAvatar } from '../views/DocumentTools.jsx';

// Teintes décoratives (jamais porteuses d'information : le nom est toujours écrit).
const TINTS = ['action', 'evidence', 'info', 'success', 'private'];

export function personInitials(person) {
  const given = String(person?.given_names ?? '').trim();
  const family = String(person?.family_name ?? '').trim();
  const letters = `${given.charAt(0)}${family.charAt(0)}`.toUpperCase();
  return letters || '?';
}

/** Pastille ronde : portrait s'il existe, sinon initiales en serif. Décorative. */
export function PersonAvatar({ person, size = 40 }) {
  if (person?.portrait_media_id) {
    return <PortraitAvatar client={client} person={person} size={size} />;
  }
  const tint = TINTS[Math.abs(Number(person?.id) || 0) % TINTS.length];
  return (
    <span
      className={`person-avatar person-avatar--${tint}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      aria-hidden="true"
    >
      {personInitials(person)}
    </span>
  );
}
