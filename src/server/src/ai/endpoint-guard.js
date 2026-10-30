import { fieldError } from '../errors.js';

const PRIVATE_V4 = [/^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./];

function isLocalHost(hostname) {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host === '::1' || host.endsWith('.local')) return true;
  return PRIVATE_V4.some((pattern) => pattern.test(host));
}

/**
 * L'IA n'accepte qu'un serveur de la machine ou du réseau local : un nom de
 * domaine public ou une adresse publique enverrait les notes généalogiques
 * (données personnelles) chez un tiers, ce que l'ADR 0010 interdit.
 * Renvoie l'adresse normalisée, sans barre finale.
 */
export function assertLocalEndpoint(value) {
  let url;
  try {
    url = new URL(String(value ?? ''));
  } catch {
    throw fieldError('endpoint', 'INVALID', 'server.validation.invalid', 'endpoint est invalide');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw fieldError(
      'endpoint',
      'INVALID',
      'server.validation.invalid',
      'endpoint doit être une adresse http ou https sans identifiants',
    );
  }
  if (!isLocalHost(url.hostname)) {
    throw fieldError(
      'endpoint',
      'NOT_LOCAL',
      'server.validation.invalid',
      'endpoint doit désigner cette machine ou le réseau local (jamais un service distant)',
    );
  }
  return `${url.protocol}//${url.host}`;
}
