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

  /** Publie des alertes (ex. vérifications automatiques) ; ignore les clés déjà vues. */
  publish(items = []) {
    const list = Array.isArray(items) ? items : [items];
    const created = list
      .filter((item) => item?.title && item?.message)
      .map((item) =>
        this.repository.create({
          type: ['info', 'warning', 'danger', 'success'].includes(item.type) ? item.type : 'info',
          title: String(item.title),
          message: String(item.message),
          personId: Number.isInteger(item.personId) ? item.personId : null,
          dedupeKey: item.dedupeKey ? String(item.dedupeKey) : null,
        }),
      )
      .filter(Boolean);
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
