const VERBS = { POST: 'Ajout', PATCH: 'Modification', PUT: 'Modification', DELETE: 'Suppression' };
const RESOURCES = {
  persons: 'personne',
  places: 'lieu',
  events: 'événement',
  unions: 'union',
  parentages: 'lien de parenté',
  sources: 'source',
  media: 'média',
  notes: 'note',
  notebook: 'carnet de recherche',
  gedcom: 'fichier GEDCOM',
  search: 'fusion de doublons',
  trash: 'corbeille',
};
const SPECIAL = [
  [/\/restore$/, 'Restauration'],
  [/\/merge$/, 'Fusion'],
  [/\/import(-archive)?$/, 'Import'],
  [/\/participants$/, 'Ajout de participant'],
  [/\/citations$/, 'Ajout de citation'],
  [/\/hypotheses$/, 'Ajout d’hypothèse'],
  [/\/evidence$/, 'Ajout de preuve'],
  [/\/tasks$/, 'Ajout de tâche'],
  [/\/regions$/, 'Identification sur photo'],
  [/\/regions\/\d+$/, 'Retrait d’identification'],
  [/\/photo$/, 'Description de photo'],
];

// Libellé lisible d'une action, affiché dans « Annuler … » / « Rétablir … ».
export function labelForRequest(method, path) {
  const segment = path.split('/').filter(Boolean)[0] ?? '';
  const resource = RESOURCES[segment] ?? segment;
  const special = SPECIAL.find(([pattern]) => pattern.test(path));
  const verb = special ? special[1] : (VERBS[method] ?? method);
  return `${verb} · ${resource}`;
}

// Préfixes d'API qui ne sont jamais des actions annulables : l'historique
// lui-même, les arbres, les comptes, les sauvegardes, les exports et l'IA.
export const NON_UNDOABLE_PREFIXES = [
  '/history',
  '/trees',
  '/storage',
  '/indexing',
  '/accounts',
  '/backups',
  '/ai',
  '/gedcom/export',
  '/gedcom/preview',
  '/search/advanced',
];
