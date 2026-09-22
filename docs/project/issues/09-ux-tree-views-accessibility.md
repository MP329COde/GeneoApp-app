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

## Suivi post-livraison

- 2026-09-22 : audit du dépôt révélant que `App.jsx` était en réalité une vitrine statique — un tableau
  `PEOPLE` codé en dur, aucun appel réseau ni IPC, zéro test. Cela contredisait la règle 4 du cahier des charges
  (« ne pas créer de données fictives en production pour masquer une API absente ») malgré le statut
  « Terminée » de cette issue. Corrigé :
  - `src/client/src/api/geneoapp-client.js` : client API unique, bascule automatique entre `window.geneoapp`
    (IPC Electron sécurisé, production) et `fetch` vers `/api` (proxy Vite, développement navigateur et tests) —
    jamais de données fictives en repli.
  - Canaux IPC `GRAPH_ANCESTORS/DESCENDANTS/RELATIONS/RELATIONSHIP` ajoutés (`channels.js`,
    `build-handlers.js`, `preload.js`) : le moteur de graphe n'était pas exposé au renderer, seuls
    personnes/lieux/événements/unions/parentages/sources/audit l'étaient.
  - `App.jsx` réécrit : charge les personnes réelles au montage, affiche un état de chargement et un état vide
    honnête (pas de repli fictif), permet de créer une personne et affiche ses relations réelles
    (`graph.relations`). Testé (`App.test.jsx`, 3 cas : état vide, chargement des relations, création).
  - `vite.config.js` : proxy `/api` → serveur Express local (port 3000) pour le mode développement navigateur.
  Limite restante : seul l'écran « personnes + relations + arbre simple » est branché. Les autres vues listées
  au cahier des charges (familles, recherche, carnet de recherche, sauvegardes/corbeille, statistiques, import
  GEDCOM, vues radiale/éventail/carte/chronologie) restent à construire côté interface — l'API existe déjà
  côté serveur pour la plupart d'entre elles.
