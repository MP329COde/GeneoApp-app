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
- 2026-09-22 (suite) : ajout d'une vue « Recherche » réelle (onglet dans le sélecteur de vues), branchée sur
  `client.search.query` (canaux IPC `SEARCH_QUERY`/`SEARCH_DUPLICATES` ajoutés, jusque-là absents de
  l'allowlist). Testée (`App.test.jsx`). Reste sans UI : détection de doublons (`potentialDuplicates`, déjà
  câblée côté client mais aucun écran ne l'utilise), familles, carnet de recherche, sauvegardes/corbeille,
  statistiques.
- 2026-09-22 (suite) : ajout d'une vue « GEDCOM » réelle (import, avec aperçu obligatoire avant import — le
  bouton « Importer » reste désactivé tant que l'aperçu n'est pas valide, ce qui matérialise dans l'UI le
  pipeline preview→validation→import transactionnel du serveur). Canaux IPC `GEDCOM_PREVIEW/IMPORT/EXPORT`
  ajoutés (jusque-là absents de l'allowlist). Testée (`App.test.jsx` : aperçu invalide bloquant, import valide
  qui recharge la liste des personnes réelles). Écran d'export ajouté dans la foulée (choix du format 7/5.5.1,
  téléchargement réel via Blob/`<a download>`), testé (déclenchement du téléchargement vérifié). Restent sans
  UI à ce stade : détection de doublons, familles, carnet de recherche, statistiques.
- 2026-09-22 (suite) : ajout d'une vue « Sauvegardes » réelle, couvrant aussi la corbeille. Ces opérations sont
  protégées par une session (comme côté API) : la vue affiche un formulaire de connexion (profil local + PIN
  optionnel) tant qu'aucune session n'est active, et crée le profil à la volée si la connexion échoue en 401
  (premier lancement local, pas d'écran séparé de création de compte — limite connue : un code PIN erroné sur
  un profil existant déclenche la même tentative de création, qui échoue proprement en conflit sans exposer de
  faille, mais le message affiché à l'utilisateur n'est pas idéalement formulé pour ce cas précis). Canaux IPC
  `ACCOUNTS_*`/`BACKUPS_*`/`TRASH_*` ajoutés (commit précédent). Une fois connecté : création de sauvegarde
  (JSON/SQLite), liste et restauration des sauvegardes, liste/restauration/purge de la corbeille — toutes
  branchées sur l'API réelle. Testé (`App.test.jsx` : accès bloqué sans session, connexion puis affichage des
  sauvegardes/corbeille réelles, création de profil à la volée). Restent sans UI : détection de doublons,
  familles, carnet de recherche, statistiques.
- 2026-09-22 (suite) : ajout d'une vue « Doublons » réelle, branchée sur `client.search.duplicates`
  (déjà exposé côté client mais jusque-là consommé par aucun écran). Affiche les paires de personnes
  potentiellement dupliquées avec leur score de similarité (`SearchService#potentialDuplicates`), et permet
  de rejoindre directement la fiche de l'une ou l'autre personne (bascule vers l'onglet Arbre avec la
  personne sélectionnée). Testé (`App.test.jsx` : analyse déclenchée à la demande, affichage du score réel,
  navigation vers la fiche B). Aucune logique de fusion n'est encore proposée (l'API ne l'expose pas non
  plus à ce stade) : l'écran signale le doublon potentiel mais ne fusionne pas les fiches — limite à traiter
  quand un assistant de fusion sera spécifié côté serveur. Restent sans UI : familles, carnet de recherche,
  statistiques.
- 2026-09-22 (suite) : ajout d'une vue « Familles » réelle, branchée sur `client.unions.*`
  (`UnionService#create/get/listForPerson/remove`, déjà exposé via IPC — `UNIONS_*` — mais absent de
  `geneoapp-client.js` et sans écran). Pour la personne sélectionnée : liste ses unions réelles (type et
  partenaire, avec navigation directe vers la fiche du partenaire), formulaire de création d'union
  (type + choix du partenaire parmi les autres personnes existantes), suppression (douce, cohérente avec le
  reste de l'application) d'une union. Ajouté à `geneoapp-client.js` (HTTP et IPC) : namespace `unions`.
  Testé (`App.test.jsx` : liste vide, création réelle via l'API, rafraîchissement affichant le partenaire).
  Restent sans UI : carnet de recherche, statistiques.
- 2026-09-22 (suite) : ajout d'une vue « Statistiques » réelle, branchée sur `client.statistics.totals`
  (`StatisticsService#totals`, route `/api/statistics` déjà testée côté API mais jusque-là ni exposée via
  IPC ni consommée par un écran). Canal IPC `STATISTICS_TOTALS` ajouté. Affiche les totaux réels par table
  (personnes, lieux, événements, unions, parentés, sources, médias). Testé (`App.test.jsx`). Le carnet de
  recherche a également été branché dans la foulée (voir issue 07, suivi post-livraison). Il ne reste plus de
  vue listée au cahier des charges de cette issue sans écran fonctionnel, même minimal ; les vues avancées
  (carte, chronologie graphique, radiale/éventail, minimap/zoom/pan) restent des versions simplifiées de leur
  ambition initiale.
- 2026-09-23 : mise en place d'une suite E2E navigateur réelle (Playwright, `playwright.config.js`,
  `test/e2e/app.spec.js`) — pilote l'application sans mock (serveur Express + client Vite + SQLite en mémoire),
  contrairement à `App.test.jsx` qui simule le client API. A immédiatement révélé un vrai bug fonctionnel :
  après ajout d'un parent/enfant via l'onglet Familles, la vue Arbre ne se rafraîchissait pas (les relations
  n'étaient rechargées que sur changement de `selectedId`). Corrigé : `loadRelations` extrait en callback
  partagé, propagé aux mutations d'union et de parenté via une prop `onChange`. `vite.config.js` : cible du
  proxy `/api` rendue configurable (`GENEOAPP_API_PORT`, défaut 3000 inchangé) pour isoler le port du serveur
  de test. `npm run test:e2e` ajouté, exécuté en CI dans un job dédié (`ci.yml`) avec upload du rapport HTML en
  cas d'échec. 5 scénarios couverts : état vide honnête, création de personne, liaison parent/enfant reflétée
  dans l'arbre, statistiques réelles, persistance du carnet de recherche après rechargement de page.
- 2026-09-23 (suite) : extension de la suite E2E à trois parcours supplémentaires — import GEDCOM réel via
  texte collé (aperçu bloquant puis import transactionnel), export GEDCOM réel (téléchargement déclenché),
  et accès aux sauvegardes (blocage sans session, connexion, création réelle). Le scénario sauvegardes a
  immédiatement révélé un vrai bug de sécurité côté client : `client.backups.list()` et
  `client.backups.verify()` (HTTP **et** IPC) n'envoyaient jamais le jeton de session, alors que le serveur
  exige une session sur toute la route `/api/backups` (`router.use(requireSession(...))` dans
  `backup.routes.js`) — en pratique, l'écran Sauvegardes ne pouvait jamais afficher la liste réelle une fois
  connecté, et côté Electron, `BACKUPS_LIST`/`BACKUPS_VERIFY` n'appliquaient même aucune vérification de
  session (incohérence avec le transport HTTP). Corrigé : `geneoapp-client.js` (les deux transports),
  `build-handlers.js` (`accounts.requireSession(token)` ajouté sur ces deux canaux) et `preload.js`
  acceptent et propagent désormais le jeton ; `App.jsx` passe `session.token` à `client.backups.list`.
  Testé (`test/electron/ipc-handlers.test.js`, nouveau cas dédié ; suite E2E complète, 8/8). Effet de bord
  découvert et corrigé au passage : les sauvegardes de test réelles s'accumulaient indéfiniment dans le
  répertoire temporaire partagé de la machine (aucun répertoire dédié aux tests) — `playwright.config.js`
  isole désormais chaque exécution via `GENEOAPP_BACKUP_DIR` pointant vers un répertoire temporaire créé et
  propre à cette exécution.
