// Toute méthode qui écrit : création, modification, ajout / retrait, décision
// sur une affirmation, import, fusion, envoi, purge.
const WRITE_METHOD =
  /^(create|update|remove|restore|merge|import|upload|purge|accept|reject|reopen|add[A-Z]\w*|remove[A-Z]\w*|update[A-Z]\w*)$/;
const SILENT_DOMAINS = new Set(['history', 'trees', 'accounts', 'backups', 'ai']);

/**
 * Enveloppe le client API : après chaque écriture réussie, appelle
 * `onWrite` (rafraîchir l'état Annuler/Rétablir) sans toucher aux appels.
 */
export function withWriteNotifications(client, onWrite) {
  return new Proxy(client, {
    get(target, domain) {
      const service = target[domain];
      if (!service || typeof service !== 'object' || SILENT_DOMAINS.has(domain)) return service;
      return new Proxy(service, {
        get(inner, method) {
          const value = inner[method];
          if (typeof value !== 'function' || !WRITE_METHOD.test(method)) return value;
          return async (...args) => {
            const result = await value.apply(inner, args);
            onWrite();
            return result;
          };
        },
      });
    },
  });
}
