const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const IGNORED_PATHS = ['/notifications', '/history', '/accounts/login', '/accounts/logout'];

export function notificationMiddleware(services) {
  return (request, response, next) => {
    if (
      !WRITE_METHODS.has(request.method) ||
      IGNORED_PATHS.some((path) => request.path.startsWith(path))
    ) {
      next();
      return;
    }

    const mutation = { method: request.method, path: request.path };
    response.on('finish', () => {
      if (response.statusCode >= 200 && response.statusCode < 300) {
        try {
          services.notifications.recordMutation({
            ...mutation,
            status: response.statusCode,
          });
        } catch (error) {
          console.error('Notification impossible à enregistrer :', error.message);
        }
      }
    });
    next();
  };
}
