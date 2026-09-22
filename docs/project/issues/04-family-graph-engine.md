# 04 - Moteur de graphe, relations et arbres

## Objectif

Implémenter le moteur généalogique central qui permet de calculer les ancêtres, descendants, parents, enfants, frères et sœurs, conjoints, chemins relationnels, ancêtres communs, cycles et relations particulières.

## Périmètre

Couvrir :

- `getAncestors(personId)`
- `getDescendants(personId)`
- `getParents(personId)`
- `getChildren(personId)`
- `getSiblings(personId)`
- `getSpouses(personId)`
- `findCommonAncestors(personA, personB)`
- `findRelationship(personA, personB)`
- `findPath(personA, personB)`
- `detectCycles()`
- `validateTimeline()`
- arbre ascendant, descendant, familial, radial, éventail
- données relationnelles multi-familles, plusieurs unions, branche paternelle/maternelle

Ne pas inclure dans cette issue :

- import/export GEDCOM complet
- IA locale
- OCR
- recherches floues
- UI graphique avancée

## Livrables attendus

- service de graphe généalogique
- API locale de relations
- fonctions de calcul relationnel et validation de cohérence
- arbre de dépendances multi-familles
- tests unitaires et de cohérence

## Critères d’acceptation

- le moteur retourne des données cohérentes pour les cas de base
- les relations multiples sont gérées
- le calcul des demi-frères, beaux-parents, unions multiples et branches est supporté
- les cycles sont détectés sans corruption de données
- le moteur distingue relation certaine et relation ambiguë ou à vérifier
- les tests couvrent les cas de parenté, unions et ancêtres communs

## Dépendances

- issue 03 terminée

## Prompt IA prêt à l’emploi

Tu es un ingénieur généalogique senior. Implémente le moteur de graphe de l’application de généalogie locale en JavaScript/Node.js, sans dépendance externe.

Contexte :

- données stockées localement en SQLite
- le frontend ne doit pas faire de logique généalogique
- le moteur doit fournir des fonctions pures et déterministes sur les données métier
- il doit supporter plusieurs familles, plusieurs unions et multiple parcours parentaux
- les relations doivent être calculées à partir des données de parentage, unions et événements

Fonctions à implémenter :

- `getAncestors(personId)`
- `getDescendants(personId)`
- `getParents(personId)`
- `getChildren(personId)`
- `getSiblings(personId)`
- `getSpouses(personId)`
- `findCommonAncestors(personA, personB)`
- `findRelationship(personA, personB)`
- `findPath(personA, personB)`
- `detectCycles()`
- `detectPotentialDuplicates()`
- `validateTimeline()`

Exigences :

- gérer les relations multiples et les doublons psychologiques (personnes proches mais distinctes)
- ne pas supposer qu’une relation est unique ; calculer des chemins et probabilités de relation
- détecter les incohérences temporelles
- ne pas fusionner des personnes automatiquement
- créer des services API métiers autour du moteur
- couvrir avec des tests unitaires les cas centraux

Résultat attendu :

- moteur généalogique fonctionnel
- API locale de relations cohérente
- arbre relationnel prêt pour UI et GEDCOM

## Sortie de livraison

Un moteur de relations généalogiques fiable, calculable et testable, base indispensable pour les vues d’arbres, la recherche et la validation des données.

## Suivi post-livraison

- 2026-09-22 : `getAncestors`/`getDescendants` acceptaient une profondeur illimitée uniquement ; ajout d’un
  paramètre `depth` optionnel (query string `?depth=`), validé côté service (`GenealogyGraphService.traverse`)
  et testé (`test/api/graph.test.js`). `detectPotentialDuplicates()` n’est pas implémenté dans ce service : la
  déduplication vit dans le module de recherche (issue 06).
- 2026-09-22 : `findRelationship` calcule désormais un champ `branch` (`PATERNAL`/`MATERNAL`/`UNKNOWN`) à partir
  du `parent_role` (`FATHER`/`MOTHER`/`PARENT`) de la première étape du chemin, pour les relations `ANCESTOR_*`,
  `DESCENDANT_*` et `COLLATERAL`. Limite connue : pour une relation `COLLATERAL` dont le chemin le plus court
  commence par une étape descendante (ex. calculée depuis un neveu vers sa tante en remontant d’abord par un
  autre rameau), la branche peut être mal orientée — cas non couvert par les tests actuels.
- 2026-09-22 (suite) : `findRelationship` renvoie désormais un champ `label` nommant le degré de parenté en
  français (`GenealogyGraphService#collateralLabel`), genré selon le `sex` de personB quand connu (`M`/`F`),
  sinon les deux formes (« frère ou sœur »). Couvre : conjoint(e), parent/grand-parent, enfant/petit-enfant,
  fratrie, oncle/tante, neveu/nièce, grand-oncle/grand-tante, petit-neveu/petite-nièce, cousin germain, cousin
  issu de germain. Au-delà de ces degrés usuels, ou si le chemin le plus court n'est pas la forme canonique
  montée-puis-descente, renvoie une étiquette générique honnête plutôt que d'inventer un terme incertain.
  Testé (`test/api/graph.test.js`, nouveau cas couvrant fratrie/oncle/neveu/cousin germain/grand-parent avec
  les deux genres). Utile pour préparer les vues radiale/éventail de la Phase I.
