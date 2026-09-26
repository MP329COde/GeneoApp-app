export function createNotificationController(services) {
  const { notifications } = services;

  return {
    list(request, response, next) {
      try {
        response.json(
          notifications.list({
            limit: request.query.limit,
            unreadOnly: request.query.unreadOnly === 'true',
          }),
        );
      } catch (error) {
        next(error);
      }
    },

    markRead(request, response, next) {
      try {
        response.json(notifications.markRead(request.params.id));
      } catch (error) {
        next(error);
      }
    },

    publish(request, response, next) {
      try {
        response.status(201).json(notifications.publish(request.body?.items ?? request.body));
      } catch (error) {
        next(error);
      }
    },

    markAllRead(_request, response, next) {
      try {
        response.json(notifications.markAllRead());
      } catch (error) {
        next(error);
      }
    },
  };
}
