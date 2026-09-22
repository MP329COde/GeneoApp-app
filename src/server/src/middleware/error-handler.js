import { toHttpError } from '../errors.js';

// eslint-disable-next-line no-unused-vars
export function errorHandler(error, request, response, next) {
  const httpError = toHttpError(error);
  const status = httpError.status ?? 500;

  if (status >= 500) {
    console.error(error);
  }

  response.status(status).json({
    error: {
      message: status >= 500 ? 'Erreur interne du serveur' : httpError.message,
      fields: httpError.fields ?? undefined,
    },
  });
}

export function notFoundHandler(request, response) {
  response.status(404).json({ error: { message: 'Route introuvable' } });
}
