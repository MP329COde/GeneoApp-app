import { NON_UNDOABLE_PREFIXES, labelForRequest } from '../history/undo-labels.js';

const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * Regroupe toutes les écritures d'une requête en une seule action annulable.
 * Le groupe est fermé à la fin de la réponse, succès ou échec (une requête
 * échouée a été annulée par sa transaction : son groupe vide est supprimé).
 */
export function undoGroup(services) {
  return (request, response, next) => {
    if (
      !WRITE_METHODS.has(request.method) ||
      NON_UNDOABLE_PREFIXES.some((prefix) => request.path.startsWith(prefix))
    ) {
      next();
      return;
    }
    const history = services.history;
    const groupId = history.begin(
      labelForRequest(request.method, request.path),
      request.performedBy,
    );
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      history.end(groupId);
    };
    response.on('finish', close);
    response.on('close', close);
    next();
  };
}
