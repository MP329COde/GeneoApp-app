// Domaine des tuiles OpenStreetMap, autorisé en img-src uniquement quand
// l'utilisateur active explicitement le mode carte « en ligne » (réglages),
// jamais par défaut (ADR : application strictement locale/hors ligne).
export const OSM_TILES_HOST = 'https://*.tile.openstreetmap.org';

export function buildContentSecurityPolicy(mapMode) {
  const imgSrc =
    mapMode === 'online' ? `'self' data: blob: ${OSM_TILES_HOST}` : "'self' data: blob:";
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "style-src-attr 'unsafe-inline'",
    `img-src ${imgSrc}`,
    "media-src 'self' blob:",
    "font-src 'self' data:",
    "connect-src 'self' http://127.0.0.1:*",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}
