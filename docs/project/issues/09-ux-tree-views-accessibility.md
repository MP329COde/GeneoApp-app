# 09 - UX généalogique, navigation, fiches et vues

## Objectif

Créer l’expérience utilisateur généalogique complète : vues arbre, graphe, chronologie, cartes, famille, personne, recherches, navigation, filtres et édition des relations.

## Périmètre

Couvrir :

- vue arbre classique
- vue graphe dynamique
- vue chronologique
- vue carte/lieux
- vue famille
- vue personne détaillée
- vue sources
- vue recherche généalogique
- filtres de profondeur, dates, lieux, branches
- navigation contextuelle et exploration généalogique

Ne pas inclure dans cette issue :

- backend lourd de recherche avancée
- IA locale
- build / packaging complet

## Livrables attendus

- écrans de vue généalogique structurés
- boîte à outils de navigation et d’édition
- fiches de personne complètes et accessibles
- écrans de recherche et de familles
- support clavier et accessibilité avancée

## Critères d’acceptation

- un utilisateur peut naviguer dans les données sans perdre le contexte
- les vues sont cohérentes entre données relationnelles et données de base
- les filtres de branch, profondeur et date fonctionnent
- les fiches de personne sont complètes et lisibles
- les interactions clavier sont couvertes et accessibles
- l’interface reste fonctionnelle en hors ligne

## Dépendances

- issues 03, 04, 06 et 07 terminées

## Prompt IA prêt à l’emploi

Tu es un UX designer senior et développeur front-end spécialisé dans les interfaces de généalogie. Implémente la couche d’expérience utilisateur de l’application de généalogie locale.

Contexte :

- le moteur de données et les API sont déjà en place
- l’application doit afficher des vues complexes de relations familiales et d’historique
- plusieurs modes d’affichage doivent cohabiter
- l’expérience doit être claire, accessible et utilisable hors ligne

Livrables requis :

- vue arbre classique
- vue graphe relationnel
- vue chronologique
- vue carte des lieux
- vue famille
- vue fiche personne complète
- vue sources
- vue recherche généalogique
- navigation contextuelle et focus sur la personne
- filtres : ancêtres, descendants, époux, collatéraux, profondeur, dates, lieux
- zoom / pan / focus / minimap / repliage / expansion si possible

Exigences de qualité :

- interface accessible au clavier
- support lecteurs d’écran
- contraste et focus visibles
- design cohérent avec le design system
- modularité des vues et composants
- rendu compatible Electron + navigateur local

Résultat attendu :

- interface de navigation généalogique complète
- écrans utilisables et testables
- UX orientée recherche, exploration et validation de données

## Sortie de livraison

Une excellente expérience de navigation généalogique locale, accessible et lisible, prête pour la production de données réelles et l’usage quotidien.
