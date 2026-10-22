import { toHttpError } from '../errors.js';

// eslint-disable-next-line no-unused-vars
export function errorHandler(error, request, response, next) {
  const httpError = toHttpError(error);
  const status = httpError.status ?? 500;

  if (status >= 500 && status !== 503) {
    console.error(error);
  }

  const internal = status >= 500 && status !== 503;
  response.status(status).json({
    error: {
      message: internal ? 'Erreur interne du serveur' : httpError.message,
      fields: httpError.fields ?? undefined,
      // Le serveur ignore la langue de l'utilisateur : il renvoie le code et
      // la clé i18n, et le client traduit dans sa langue.
      // Le code d'une erreur interne (ex. SQLITE_ERROR) révèle l'implémentation.
      code: internal ? undefined : (httpError.code ?? undefined),
      translationKey: httpError.translationKey ?? undefined,
      variables: httpError.variables ?? undefined,
    },
  });
}

export function notFoundHandler(request, response) {
  response.status(404).json({
    error: {
      message: 'Route introuvable',
      code: 'ROUTE_NOT_FOUND',
      translationKey: 'server.route.notFound',
    },
  });
}
