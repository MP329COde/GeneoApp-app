import { useState } from 'react';
import { Button } from '../design-system/index.js';
import { Icon } from './shared.jsx';
import { useNotifications } from '../hooks/useNotifications.js';

const NOTIFICATION_TONES = {
  danger: 'danger',
  warning: 'warning',
  info: 'info',
  success: 'success',
};

export function NotificationCenter({ onOpenPerson }) {
  const [open, setOpen] = useState(false);
  const { notifications, refresh, markRead, markAllRead } = useNotifications();

  return (
    <div className="notification-center">
      <button
        type="button"
        className="icon-button notification-center__trigger"
        aria-expanded={open}
        aria-label={`Notifications${notifications.unread ? ` (${notifications.unread} non lues)` : ''}`}
        title="Notifications"
        onClick={() => {
          setOpen((value) => !value);
          refresh();
        }}
      >
        <Icon name="bell" />
        {notifications.unread ? (
          <span className="notification-center__count">{notifications.unread}</span>
        ) : null}
      </button>
      {open ? (
        <section className="notification-center__panel" aria-label="Notifications">
          <header className="notification-center__header">
            <h2>Notifications</h2>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!notifications.unread}
              onClick={markAllRead}
            >
              Tout lire
            </Button>
          </header>
          {notifications.items.length === 0 ? (
            <p className="notification-center__empty">Aucune notification.</p>
          ) : (
            <ul className="notification-center__list">
              {notifications.items.map((notification) => (
                <li
                  key={notification.id}
                  className={`notification-center__item notification-center__item--${NOTIFICATION_TONES[notification.type] ?? 'info'}${notification.read_at ? '' : ' is-unread'}`}
                >
                  <div>
                    <strong>{notification.title}</strong>
                    <p>{notification.message}</p>
                    <time dateTime={notification.created_at}>
                      {new Date(notification.created_at).toLocaleString('fr-FR')}
                    </time>
                    {notification.person_id && onOpenPerson ? (
                      <button
                        type="button"
                        className="link-button link-button--small"
                        onClick={async () => {
                          onOpenPerson(notification.person_id);
                          setOpen(false);
                          if (!notification.read_at) await markRead(notification.id);
                        }}
                      >
                        Voir dans l’arbre
                      </button>
                    ) : null}
                  </div>
                  {!notification.read_at ? (
                    <button
                      type="button"
                      className="notification-center__read"
                      onClick={() => markRead(notification.id)}
                    >
                      Lire
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
