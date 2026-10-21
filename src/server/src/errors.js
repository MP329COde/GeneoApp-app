export class ValidationError extends Error {
  constructor(message, { fields = {} } = {}) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
    this.fields = fields;
  }
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
      return new ConflictError(
        'Suppression impossible : des données sont encore rattachées à cet élément',
      );
    }
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return new ConflictError('Cet élément existe déjà : une valeur identique est déjà utilisée');
    }
    return new ConflictError('Conflit de contrainte de données');
  }
  return error;
}
