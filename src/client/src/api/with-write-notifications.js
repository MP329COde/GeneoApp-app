const WRITE_METHOD =
  /^(create|update|remove|restore|merge|import|addParticipant|addCitation|upload|purge)$/;
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
