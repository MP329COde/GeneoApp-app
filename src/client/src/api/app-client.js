import { createGeneoAppClient } from './geneoapp-client.js';
import { withWriteNotifications } from './with-write-notifications.js';

// Toute écriture réussie notifie les abonnés (ex. App pour rafraîchir Annuler/Rétablir).
export const writeListeners = new Set();

export const client = withWriteNotifications(createGeneoAppClient(), () => {
  for (const listener of writeListeners) listener();
});
