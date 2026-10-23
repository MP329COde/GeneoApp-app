import { fieldError } from '../errors.js';

/**
 * Erreurs de validation d'un champ, dans une forme que le client sait
 * traduire.
 *
 * Le serveur ne connaît pas la langue de l'utilisateur : il renvoie un code
 * stable et une clé i18n, et le client traduit. Le message français reste le
 * repli, et la structure est identique quel que soit le transport (HTTP ou
 * IPC), ce qui évite deux implémentations.
 *
 * `field` est le nom technique du champ (donnée, pas texte) ; le client
 * l'affiche tel quel dans un message traduit.
 */

/** Champ obligatoire. */
export function requiredError(field, message) {
  return fieldError(
    field,
    'REQUIRED',
    'server.validation.required',
    message ?? `${field} est obligatoire`,
    { field },
  );
}

/** Champ trop long. */
export function tooLongError(field, max, message) {
  return fieldError(
    field,
    'TOO_LONG',
    'server.validation.tooLong',
    message ?? `${field} ne peut pas dépasser ${max} caractères`,
    { field, max },
  );
}

/** Valeur hors de ce qui est accepté. */
export function invalidError(field, message, variables = {}) {
  return fieldError(
    field,
    'INVALID',
    'server.validation.invalid',
    message ?? `${field} est invalide`,
    { field, ...variables },
  );
}

/** Valeur introuvable. */
export function notFoundError(field, message) {
  return fieldError(
    field,
    'NOT_FOUND',
    'server.validation.notFound',
    message ?? `${field} est introuvable`,
    { field },
  );
}
