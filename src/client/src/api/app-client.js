import { createGeneoAppClient } from './geneoapp-client.js';
import { withWriteNotifications } from './with-write-notifications.js';

// Toute écriture réussie notifie les abonnés (ex. App pour rafraîchir Annuler/Rétablir).
export const writeListeners = new Set();

// `persons.list()` renvoie une enveloppe `{ items, total, limit, offset }`.
// Les adaptateurs qui renvoient encore un tableau simple (tests, Electron
// avant migration complète) sont normalisés ici : les appelants n'ont donc
// jamais à gérer les deux formes.
function normalizePersonsList(api) {
  const persons = api?.persons;
  if (!persons || typeof persons.list !== 'function') return api;
  return {
    ...api,
    persons: {
      ...persons,
      list: async (...args) => {
        const result = await persons.list(...args);
        if (!Array.isArray(result)) return result;
        return { items: result, total: result.length, limit: result.length, offset: 0 };
      },
    },
  };
}

export const client = withWriteNotifications(normalizePersonsList(createGeneoAppClient()), () => {
  for (const listener of writeListeners) listener();
});
