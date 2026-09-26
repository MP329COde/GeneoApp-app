const PATH_LABELS = [
  [/\/backups(?:\/|$)/, 'Sauvegarde'],
  [/\/gedcom(?:\/|$)/, 'GEDCOM'],
  [/\/persons(?:\/|$)/, 'Personne'],
  [/\/events(?:\/|$)/, 'Événement'],
  [/\/sources(?:\/|$)/, 'Source'],
  [/\/media(?:\/|$)/, 'Média'],
  [/\/notes(?:\/|$)/, 'Note'],
  [/\/notebook(?:\/|$)/, 'Carnet de recherche'],
  [/\/trash(?:\/|$)/, 'Corbeille'],
];

function labelForPath(path) {
  return PATH_LABELS.find(([pattern]) => pattern.test(path))?.[1] ?? 'Données';
}

export class NotificationService {
  static MAX_CREATED_PER_PUBLISH = 20;

  constructor(repository) {
    this.repository = repository;
  }

  list(options) {
    return { items: this.repository.list(options), unread: this.repository.countUnread() };
  }

  markRead(id) {
    return this.repository.markRead(Number(id));
  }

  markAllRead() {
    return this.repository.markAllRead();
  }

  /**
   * Publie des alertes (ex. vérifications automatiques) ; ignore les clés déjà
   * vues. Plafonné à MAX_CREATED_PER_PUBLISH notifications non lues créées par
   * appel : une analyse (ex. après un import GEDCOM massif) peut produire un
   * grand nombre d'alertes distinctes, mais le centre de notifications ne
   * doit jamais être noyé (voir contre-audit, point 4). Au-delà, les alertes
   * restent visibles ailleurs (pastilles sur les fiches, écran Cohérence).
   */
  publish(items = []) {
    const list = Array.isArray(items) ? items : [items];
    const created = [];
    for (const item of list) {
      if (created.length >= NotificationService.MAX_CREATED_PER_PUBLISH) break;
      if (!item?.title || !item?.message) continue;
      const result = this.repository.create({
        type: ['info', 'warning', 'danger', 'success'].includes(item.type) ? item.type : 'info',
        title: String(item.title),
        message: String(item.message),
        personId: Number.isInteger(item.personId) ? item.personId : null,
        dedupeKey: item.dedupeKey ? String(item.dedupeKey) : null,
      });
      if (result) created.push(result);
    }
    return { created: created.length };
  }

  recordMutation({ method, path, status }) {
    const label = labelForPath(path);
    const action = method === 'DELETE' ? 'supprimée' : method === 'PATCH' ? 'modifiée' : 'créée';
    return this.repository.create({
      type: 'success',
      title: `${label} ${action}`,
      message: `${label} ${action} avec succès.`,
      metadata: { method, path, status },
    });
  }
}
