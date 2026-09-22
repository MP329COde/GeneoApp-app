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
    return new ConflictError('Conflit de contrainte de données');
  }
  return error;
}
