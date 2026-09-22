import { ValidationError } from '../errors.js';

export function assertValid(fields) {
  const errors = {};

  for (const [name, checks] of Object.entries(fields)) {
    for (const check of checks) {
      const message = check();
      if (message) {
        errors[name] = message;
        break;
      }
    }
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Validation échouée', { fields: errors });
  }
}

export function required(value, label = 'Ce champ') {
  return () => {
    if (value === undefined || value === null || value === '') {
      return `${label} est obligatoire`;
    }
    return null;
  };
}

export function isString(value, label = 'Ce champ') {
  return () => {
    if (value !== undefined && value !== null && typeof value !== 'string') {
      return `${label} doit être une chaîne de caractères`;
    }
    return null;
  };
}

export function nonEmptyString(value, label = 'Ce champ') {
  return () => {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string' || value.trim().length === 0) {
      return `${label} ne peut pas être une chaîne vide`;
    }
    return null;
  };
}

export function maxLength(value, max, label = 'Ce champ') {
  return () => {
    if (typeof value === 'string' && value.length > max) {
      return `${label} ne peut pas dépasser ${max} caractères`;
    }
    return null;
  };
}

export function oneOf(value, allowed, label = 'Ce champ') {
  return () => {
    if (value !== undefined && value !== null && !allowed.includes(value)) {
      return `${label} doit être l'une des valeurs suivantes : ${allowed.join(', ')}`;
    }
    return null;
  };
}

export function isInteger(value, label = 'Ce champ') {
  return () => {
    if (value !== undefined && value !== null && !Number.isInteger(value)) {
      return `${label} doit être un entier`;
    }
    return null;
  };
}

export function isFiniteNumber(value, label = 'Ce champ') {
  return () => {
    if (value !== undefined && value !== null && !Number.isFinite(value)) {
      return `${label} doit être un nombre`;
    }
    return null;
  };
}

export function isArray(value, label = 'Ce champ') {
  return () => {
    if (value !== undefined && value !== null && !Array.isArray(value)) {
      return `${label} doit être une liste`;
    }
    return null;
  };
}

export function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
