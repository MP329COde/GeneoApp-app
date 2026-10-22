/**
 * Correspondances entre les valeurs d'énumération renvoyées par le serveur
 * et les clés de traduction.
 *
 * Ces tableaux vivent à part : plusieurs vues les partagent (les unions, les
 * rôles de parenté, les réattributions de fusion), et les garder ici évite
 * qu'un module de vue tire l'autre dans ses dépendances.
 *
 * Chaque correspondance associe une clé de message à la valeur. Le repli
 * (`??`) affiche la valeur brute du serveur quand la clé est absente, ce
 * qui évite un écran vide si le serveur introduit une nouvelle valeur.
 */

// Types d'union reconnus par le modèle.
export const UNION_TYPE_KEYS = {
  MARRIAGE: 'union.type.marriage',
  CIVIL_PARTNERSHIP: 'union.type.civil',
  COHABITATION: 'union.type.cohabitation',
  OTHER: 'union.type.other',
};

// Rôles de parenté.
export const PARENT_ROLE_KEYS = {
  FATHER: 'parentRole.father',
  MOTHER: 'parentRole.mother',
  PARENT: 'parentRole.parent',
};

// Réattributions effectuées lors d'une fusion de fiches.
export const MERGE_REASSIGNMENT_KEYS = {
  parentagesAsParent: 'merge.reassignment.parentagesAsParent',
  parentagesAsChild: 'merge.reassignment.parentagesAsChild',
  unionPartnerships: 'merge.reassignment.unionPartnerships',
  eventParticipations: 'merge.reassignment.eventParticipations',
  citations: 'merge.reassignment.citations',
  notes: 'merge.reassignment.notes',
  assertions: 'merge.reassignment.assertions',
  identifiers: 'merge.reassignment.identifiers',
  media: 'merge.reassignment.media',
};

// Types d'entités présents dans l'index de recherche.
export const SEARCH_ENTITY_KEYS = {
  PERSON: 'search.entity.person',
  MEDIA: 'search.entity.media',
  SOURCE: 'search.entity.source',
  EVENT: 'search.entity.event',
  PLACE: 'search.entity.place',
  UNION: 'search.entity.union',
  PARENTAGE: 'search.entity.parentage',
};
