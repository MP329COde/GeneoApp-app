/**
 * Erreur de validation d'un champ.
 *
 * Le message reste en français : c'est le repli. `code` et `translationKey`
 * permettent au client de traduire le message dans sa langue, et `variables`
 * fournit les valeurs à interpoler (nom du champ, liste des valeurs
 * autorisées…).
 */
export class ValidationError extends Error {
  constructor(message, { fields = {}, code = null, translationKey = null, variables = {} } = {}) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
    this.fields = fields;
    this.code = code;
    this.translationKey = translationKey;
    this.variables = variables;
  }
}

/**
 * Construit un `ValidationError` dont le message est lui aussi traduisible.
 *
 * `field` est le nom technique du champ (par exemple « givenNames ») :
 * c'est une donnée, pas un texte, et le client ne la traduit pas.
 */
export function fieldError(field, code, translationKey, message, variables = {}) {
  return new ValidationError(message, {
    fields: { [field]: { code, translationKey, message, variables } },
    code,
    translationKey,
    variables: { field, ...variables },
  });
}

export class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
    this.status = 404;
  }
}

export class UnauthorizedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnauthorizedError';
    this.status = 401;
  }
}

export class ForbiddenError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ForbiddenError';
    this.status = 403;
  }
}

export class ConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConflictError';
    this.status = 409;
  }
}

export class PayloadTooLargeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PayloadTooLargeError';
    this.status = 413;
  }
}

export class UnsupportedMediaTypeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnsupportedMediaTypeError';
    this.status = 415;
  }
}

export class ServiceUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ServiceUnavailableError';
    this.status = 503;
  }
}

export class TooManyRequestsError extends Error {
  constructor(message, retryAfterSeconds) {
    super(message);
    this.name = 'TooManyRequestsError';
    this.status = 429;
    this.code = 'TOO_MANY_ATTEMPTS';
    this.translationKey = 'server.error.tooManyAttempts';
    this.variables = { seconds: retryAfterSeconds };
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function toHttpError(error) {
  if (error.status) {
    return error;
  }
  if (typeof error.code === 'string' && error.code.startsWith('SQLITE_CONSTRAINT')) {
    // Le message doit dire quoi faire, pas seulement nommer la technique :
    // « Conflit de contrainte de données » ne permettait à l'utilisateur
    // aucune action. La violation de clé étrangère signale une suppression
    // refusée parce que des données y sont encore rattachées.
    if (error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
      const conflict = new ConflictError(
        'Suppression impossible : des données sont encore rattachées à cet élément',
      );
      conflict.code = 'CONSTRAINT_FOREIGNKEY';
      conflict.translationKey = 'server.error.constraintForeignkey';
      return conflict;
    }
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      const conflict = new ConflictError(
        'Cet élément existe déjà : une valeur identique est déjà utilisée',
      );
      conflict.code = 'CONSTRAINT_UNIQUE';
      conflict.translationKey = 'server.error.constraintUnique';
      return conflict;
    }
    const conflict = new ConflictError('Conflit de contrainte de données');
    conflict.code = 'CONSTRAINT_DATA';
    conflict.translationKey = 'server.error.constraintData';
    return conflict;
  }
  return error;
}
