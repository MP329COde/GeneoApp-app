// Seules les adresses https sans identifiants intégrés peuvent quitter
// l'application (ouverture dans le navigateur du système).
export function isSafeExternalUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}
