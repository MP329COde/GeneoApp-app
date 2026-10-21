import { ValidationError } from '../errors.js';

/**
 * Problème de validation d'un champ.
 *
 * `message` est le texte français de repli (inchangé, il reste la référence).
 * `code` est un identifiant stable et `translationKey` la clé i18n que le
 * client traduit : le serveur n'a pas à connaître la langue de l'utilisateur.
 * `variables` porte les valeurs à interpoler.
 */
function problem(code, translationKey, message, variables = {}) {
  return { code, translationKey, message, variables };
}

export function assertValid(fields) {
  const errors = {};

  for (const [name, checks] of Object.entries(fields)) {
    for (const check of checks) {
      const found = check();
      if (found) {
        errors[name] = found;
        break;
      }
    }
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Validation échouée', {
      fields: errors,
      code: 'VALIDATION_FAILED',
      translationKey: 'server.validation.failed',
    });
  }
}

export function required(value, label = 'Ce champ') {
  return () => {
    if (value === undefined || value === null || value === '') {
      return problem('REQUIRED', 'server.validation.required', `${label} est obligatoire`, {
        field: label,
      });
    }
    return null;
  };
}

export function isString(value, label = 'Ce champ') {
  return () => {
    if (value !== undefined && value !== null && typeof value !== 'string') {
      return problem(
        'NOT_A_STRING',
        'server.validation.notAString',
        `${label} doit être une chaîne de caractères`,
        { field: label },
      );
    }
    return null;
  };
}

export function nonEmptyString(value, label = 'Ce champ') {
  return () => {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string' || value.trim().length === 0) {
      return problem(
        'EMPTY_STRING',
        'server.validation.emptyString',
        `${label} ne peut pas être une chaîne vide`,
        { field: label },
      );
    }
    return null;
  };
}

export function maxLength(value, max, label = 'Ce champ') {
  return () => {
    if (typeof value === 'string' && value.length > max) {
      return problem(
        'TOO_LONG',
        'server.validation.tooLong',
        `${label} ne peut pas dépasser ${max} caractères`,
        { field: label, max },
      );
    }
    return null;
  };
}

export function oneOf(value, allowed, label = 'Ce champ') {
  return () => {
    if (value !== undefined && value !== null && !allowed.includes(value)) {
      return problem(
        'NOT_ALLOWED',
        'server.validation.notAllowed',
        `${label} doit être l'une des valeurs suivantes : ${allowed.join(', ')}`,
        { field: label, allowed: allowed.join(', ') },
      );
    }
    return null;
  };
}

export function isInteger(value, label = 'Ce champ') {
  return () => {
    if (value !== undefined && value !== null && !Number.isInteger(value)) {
      return problem(
        'NOT_AN_INTEGER',
        'server.validation.notAnInteger',
        `${label} doit être un entier`,
        { field: label },
      );
    }
    return null;
  };
}

export function isFiniteNumber(value, label = 'Ce champ') {
  return () => {
    if (value !== undefined && value !== null && !Number.isFinite(value)) {
      return problem(
        'NOT_A_NUMBER',
        'server.validation.notANumber',
        `${label} doit être un nombre`,
        { field: label },
      );
    }
    return null;
  };
}

export function isBoolean(value, label = 'Ce champ') {
  return () => {
    if (value !== undefined && value !== null && typeof value !== 'boolean') {
      return problem(
        'NOT_A_BOOLEAN',
        'server.validation.notABoolean',
        `${label} doit être un booléen`,
        { field: label },
      );
    }
    return null;
  };
}

export function isArray(value, label = 'Ce champ') {
  return () => {
    if (value !== undefined && value !== null && !Array.isArray(value)) {
      return problem(
        'NOT_AN_ARRAY',
        'server.validation.notAnArray',
        `${label} doit être une liste`,
        { field: label },
      );
    }
    return null;
  };
}

export function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
