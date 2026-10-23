import { useCallback, useEffect, useState } from 'react';
import { client, writeListeners } from '../api/app-client.js';

export function useNotifications() {
  const [notifications, setNotifications] = useState({ items: [], unread: 0 });

  const refresh = useCallback(async () => {
    try {
      setNotifications(await client.notifications.list({ limit: 30 }));
    } catch {
      // Le centre reste optionnel si la base est en cours de changement d'arbre.
    }
  }, []);

  useEffect(() => {
    refresh();
    writeListeners.add(refresh);
    window.addEventListener('geneoapp:notifications', refresh);
    return () => {
      writeListeners.delete(refresh);
      window.removeEventListener('geneoapp:notifications', refresh);
    };
  }, [refresh]);

  const markRead = async (id) => {
    await client.notifications.markRead(id);
    await refresh();
  };

  const markAllRead = async () => {
    await client.notifications.markAllRead();
    await refresh();
  };

  return { notifications, refresh, markRead, markAllRead };
}
