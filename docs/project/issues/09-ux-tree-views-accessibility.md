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
- 2026-09-23 (suite) : ajout d'un assistant de fusion de doublons réel, jusque-là absent (l'écran « Doublons »
  ne faisait que détecter et permettre de consulter les deux fiches, sans action de fusion — limite documentée
  explicitement plus haut). Nouveau `MergeService` (`src/server/src/services/merge.service.js`) :
  réattribue au survivant toutes les données réelles portées par le doublon (filiations, appartenance à une
  union, participation à un événement, citations, notes, médias) avant de supprimer la fiche du doublon en
  douceur (jamais définitivement) ; quand une réattribution créerait un doublon de lien (ex. le même enfant
  déjà relié aux deux fiches), le lien du doublon est supprimé en douceur plutôt que réattribué, pour ne
  jamais violer les contraintes d'unicité des tables de jonction. Toute la fusion s'exécute dans une seule
  transaction et journalise deux entrées d'audit (`MERGE` sur le survivant, `DELETE` sur le doublon) — la
  contrainte CHECK de `audit_log.operation` a dû être étendue pour accepter `MERGE`
  (migration `0009_expand_audit_operations.sql`, reconstruction de table selon la procédure SQLite standard,
  comme déjà fait pour `events` en migration 0008). Exposé via `POST /api/search/merge` et le canal IPC
  `SEARCH_MERGE` (les deux transports, avec test dédié pour chacun). L'écran « Doublons » propose désormais
  deux boutons « Fusionner (garder A/B) » par paire détectée. Testé : 4 cas API (réattribution réelle,
  résolution de conflit d'unicité, rejet id identique, 404), 1 cas IPC, 1 cas client (Vitest), 1 scénario E2E
  Playwright (fusionne un vrai doublon créé par l'import GEDCOM précédent, vérifie la disparition de la fiche
  et la mise à jour du compte réel de personnes). Limite restante : aucune prévisualisation des changements
  avant confirmation (pas de `previewPersons` exposé côté API/IPC pour l'instant, seule la méthode existe
  côté service) — à exposer si un écran de confirmation détaillée est demandé.
  **Fait le jour même** (voir entrée suivante) : `previewPersons` est désormais exposé et consommé par un
  écran de confirmation avant fusion.
- 2026-09-23 (suite) : exposition de `MergeService#previewPersons` (jusque-là non branché) via
  `GET /api/search/merge/preview` et le canal IPC `SEARCH_MERGE_PREVIEW`. L'écran « Doublons » affiche
  désormais un aperçu chiffré (nombre de filiations, unions, participations à un événement, citations, notes
  et médias réellement réattribués) avant toute confirmation explicite — la fusion elle-même ne se déclenche
  qu'au clic sur « Confirmer la fusion » ; « Annuler » referme l'aperçu sans rien modifier. Testé : 1 cas API
  (aperçu sans effet de bord, fusion réelle toujours possible ensuite), 1 cas IPC (vérifie qu'aucune donnée
  n'est modifiée par le seul aperçu), 1 cas client (Vitest) et le scénario E2E de fusion mis à jour pour
  couvrir le nouveau garde-fou de confirmation.
- 2026-09-23 (suite) : ajout d'un raccourci clavier documenté (Phase J du cahier des charges — « raccourcis
  documentés » restait non prouvé). Dans la liste des personnes, `↓`/`↑` déplacent la sélection vers la
  personne suivante/précédente (avec bouclage), déplacent le focus clavier en conséquence et rafraîchissent
  aussitôt les relations affichées — géré au niveau de chaque bouton (`PersonCard`) plutôt que sur l'élément
  `<nav>` conteneur, pour rester conforme à la règle d'accessibilité `jsx-a11y/no-noninteractive-element-
  interactions` (jamais de gestionnaire clavier/souris sur un élément non interactif). Documenté dans
  `README.md`. Testé : 1 cas client (Vitest, `ArrowDown`/`ArrowUp` déclenchent bien le rechargement des
  relations de la personne suivante/précédente) et 1 scénario E2E Playwright (focus clavier réel qui se
  déplace effectivement au bouton suivant).

- 2026-09-23 (suite) : ajout d'une vue « Chronologie » réelle, jusque-là absente (seule une vue par personne
  existait via l'onglet « Événements » ; aucune vue transverse triant tous les événements de l'arbre).
  `EventRepository#listAll`/`EventService#listAll` renvoient tous les événements réels (non supprimés),
  triés par `date_text` (événements datés d'abord, sans date en dernier), chacun avec le nom du lieu déjà
  résolu et ses participants (avec leur nom), pour éviter tout N+1 côté écran. Exposé via `GET /api/events`
  et le canal IPC `EVENTS_LIST_ALL` (les deux transports). L'écran liste chronologiquement type, date, lieu
  et participants, avec un bouton par participant pour rejoindre sa fiche. Testé : 1 cas API (tri, lieu,
  participants), 1 cas IPC, 1 cas client (Vitest), 1 scénario E2E Playwright (chronologie réelle issue de
  l'import GEDCOM précédent). Limite restante : le tri reste purement textuel sur `date_text` (pas de dates
  structurées en base), donc l'ordre chronologique n'est fiable que pour des dates au format comparable
  lexicographiquement (ex. AAAA-MM-JJ) — cohérent avec le reste de l'application qui traite déjà la date
  comme texte libre à précision variable (EXACT/ABOUT/BEFORE/AFTER/BETWEEN/UNKNOWN).
- 2026-09-23 (suite) : ajout d'une vue « Carte » réelle. Les colonnes `latitude`/`longitude` de la table
  `places` existaient déjà côté modèle et validation mais aucune interface ne permettait de les saisir ni de
  les visualiser. Le formulaire de création de lieu (dans l'écran Événements) porte désormais des champs
  latitude/longitude optionnels, envoyés tels quels à `client.places.create`. La carte elle-même est un SVG
  statique en projection équirectangulaire simple (aucune tuile chargée depuis un service en ligne — rester
  strictement hors ligne sans ouvrir de dérogation ADR 0006) : chaque lieu réel avec coordonnées devient un
  point nommé ; les lieux sans coordonnées sont listés séparément plutôt que masqués silencieusement. Testé :
  1 cas client (Vitest, points géolocalisés + lieux non localisés), 1 scénario E2E Playwright (saisie réelle
  de coordonnées via le formulaire d'événement, vérification du point sur la carte). Limite assumée : pas de
  zoom/pan/tuiles satellite — une carte-croquis fonctionnelle et déjà bien plus qu'un espace réservé vide,
  conforme à l'ambition « version simplifiée » déjà actée pour cette vue.
- 2026-09-23 (suite) : ajout d'une vue « Cohérence » réelle. `GenealogyGraphService#detectCycles` et
  `#validateTimeline` existaient déjà côté moteur (Phase C du cahier des charges) et étaient testés côté API
  (`/api/graph/cycles`, `/api/graph/timeline`), mais n'étaient exposés ni via IPC ni par aucun écran — un
  utilisateur ne pouvait jamais voir un cycle de filiation ou une incohérence de date (naissance après décès,
  mariage après décès, enfant né après le décès d'un parent) que l'application avait pourtant détectée.
  Canaux IPC `GRAPH_CYCLES`/`GRAPH_TIMELINE` ajoutés (les deux transports). L'écran liste les cycles détectés
  (chemin complet des personnes impliquées) et les incohérences de chronologie (gravité, libellé, lien direct
  vers la fiche concernée) — signalement seul, jamais de correction ni de fusion automatique, conformément à
  la Phase F du cahier des charges. Testé : 1 cas IPC, 1 cas client (Vitest), 1 scénario E2E Playwright
  (vérifie l'absence de faux positif sur les données réelles déjà créées par le reste de la suite).
- 2026-09-23 (suite) : exposition de `GenealogyGraphService#findCommonAncestors` (Phase C — même angle mort
  que `detectCycles`/`validateTimeline` : testé côté API depuis longtemps, jamais exposé via IPC ni consommé
  par un écran). Canal IPC `GRAPH_COMMON_ANCESTORS` ajouté (les deux transports). Nouvel outil « Ancêtres
  communs » dans la fiche personne : sélection d'une deuxième personne, affichage des ancêtres partagés avec
  leur génération respective depuis chacune des deux personnes, et lien direct vers leur fiche. Testé : 1 cas
  IPC (ancêtre commun réel calculé par filiation), 1 cas client (Vitest), 1 scénario E2E Playwright (absence
  réelle d'ancêtre commun entre deux personnes sans lien de filiation).
- 2026-09-23 (suite) : audit systématique de toutes les routes API face aux canaux IPC et au client (`for f in
  src/server/src/routes/*.js`) pour détecter d'autres angles morts moteur→interface du même type que les
  trois précédents. Trouvé : `DELETE /api/accounts/:id` (suppression de profil local, protégée par session,
  testée côté API) n'était exposée ni via IPC ni par le client ni par aucun écran — une fois connecté, un
  utilisateur ne pouvait ni se déconnecter, ni supprimer son profil local, alors que ces deux actions sont
  attendues pour « travail avec plusieurs profils locaux » (Phase H). Canal IPC `ACCOUNTS_REMOVE` ajouté (les
  deux transports, `accounts.requireSession` appliqué comme pour les autres opérations sensibles). L'écran
  Sauvegardes affiche désormais le profil connecté avec deux actions réelles : « Se déconnecter »
  (`client.accounts.logout`) et « Supprimer ce profil » (`client.accounts.remove`), les deux ramenant au
  formulaire de connexion. `GET /api/reports/summary` reste volontairement non exposé : contenu strictement
  redondant avec la vue Statistiques déjà branchée (mêmes totaux, horodatage en plus), sans valeur ajoutée
  distincte. Testé : 1 cas IPC (session requise, suppression réelle vérifiée via la liste des profils), 1 cas
  client (Vitest, déconnexion puis reconnexion puis suppression), 1 scénario E2E Playwright (parcours complet
  déconnexion → reconnexion → suppression → re-création via le repli 401 de premier lancement).
