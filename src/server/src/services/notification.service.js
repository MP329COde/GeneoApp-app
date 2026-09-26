// `gender`/`plural` pilotent l'accord du participe passé ("créé(e)(s)") :
// sans eux, un seul accord (féminin singulier) était appliqué à tous les
// libellés, produisant des messages incorrects ("GEDCOM créée", "Événement
// créée", "Données créée" au lieu de "GEDCOM créé", "Événement créé",
// "Données créées").
const PATH_LABELS = [
  [/\/backups(?:\/|$)/, { label: 'Sauvegarde', gender: 'f', plural: false }],
  [/\/gedcom(?:\/|$)/, { label: 'GEDCOM', gender: 'm', plural: false }],
  [/\/persons(?:\/|$)/, { label: 'Personne', gender: 'f', plural: false }],
  [/\/events(?:\/|$)/, { label: 'Événement', gender: 'm', plural: false }],
  [/\/sources(?:\/|$)/, { label: 'Source', gender: 'f', plural: false }],
  [/\/media(?:\/|$)/, { label: 'Média', gender: 'm', plural: false }],
  [/\/notes(?:\/|$)/, { label: 'Note', gender: 'f', plural: false }],
  [/\/notebook(?:\/|$)/, { label: 'Carnet de recherche', gender: 'm', plural: false }],
  [/\/trash(?:\/|$)/, { label: 'Corbeille', gender: 'f', plural: false }],
];
const DEFAULT_LABEL = { label: 'Données', gender: 'f', plural: true };

function labelForPath(path) {
  return PATH_LABELS.find(([pattern]) => pattern.test(path))?.[1] ?? DEFAULT_LABEL;
}

// Accorde un participe passé masculin singulier ("créé", "modifié",
// "supprimé") en genre et en nombre.
function agree(base, { gender, plural }) {
  return `${base}${gender === 'f' ? 'e' : ''}${plural ? 's' : ''}`;
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
    const descriptor = labelForPath(path);
    const base = method === 'DELETE' ? 'supprimé' : method === 'PATCH' ? 'modifié' : 'créé';
    const action = agree(base, descriptor);
    return this.repository.create({
      type: 'success',
      title: `${descriptor.label} ${action}`,
      message: `${descriptor.label} ${action} avec succès.`,
      metadata: { method, path, status },
    });
  }
}
